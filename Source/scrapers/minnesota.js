/**
 * JobScout
 * Automated Job Monitoring and Relevance Filtering
 *
 * Created by Ezgi Havsoy, PhD
 * Copyright (c) 2026 Ezgi Havsoy
 *
 * Minnesota state job scraper
 */


const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

///////////////////////////////////////////////////////
// Load user configuration
///////////////////////////////////////////////////////

const configPath = path.join(__dirname, "..", "..", "config", "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

console.log("JobScout configuration loaded.");

(async () => {

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Opening MMB Careers...");

    await page.goto(
        "https://mn.gov/mmb/careers/search-for-jobs/",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000 });

    console.log("Waiting for Search for jobs now...");

    const [jobsPage] = await Promise.all([
        context.waitForEvent("page"),
        page.getByText("Search for jobs now").click()]);

    await jobsPage.waitForLoadState("networkidle");

    console.log("New tab opened.");

    await jobsPage.getByText("View All Jobs").waitFor();

    console.log("Clicking View All Jobs...");

    await jobsPage.getByText("View All Jobs").click();

    await jobsPage.waitForSelector(
        "li[id^='HRS_AGNT_RSLT_I']",
        { timeout: 60000 });

    console.log("Jobs loaded!");
    console.log("Loading all jobs...");

    let previousCount = 0;

    while (true) {

        await jobsPage.evaluate(() => {
            document.querySelectorAll("*").forEach(el => {
                try {
                    el.scrollTop = el.scrollHeight;
                } catch (e) {}});});

        await jobsPage.waitForTimeout(2000);

        const count = await jobsPage.locator("li[id^='HRS_AGNT_RSLT_I']").count();

        console.log(`Loaded ${count} jobs`);

        if (count === previousCount) break;
        previousCount = count;}

    console.log(`Finished loading ${previousCount} jobs.`);

    /////////////////////////////////////////////////////////
    // Extract all listings
    /////////////////////////////////////////////////////////

    const jobs = await jobsPage.$$eval(
        "li[id^='HRS_AGNT_RSLT_I']",
        rows => rows.map((row, index) => {
            const values = [...row.querySelectorAll("span.ps_box-value")].map(x => x.innerText.trim());

            return {
                state: "Minnesota",
                row: index,
                working_title: values[0],
                job_id: values[1],
                location: values[2],
                agency: values[3],
                job_family: values[4],
                job_function: values[5],
                posted: values[6] };}));

console.log(`Extracted ${jobs.length} listings.`);

/////////////////////////////////////////////////////////
// Keep only jobs posted in last X days
/////////////////////////////////////////////////////////

const today = new Date();

const recentJobs = jobs.filter(job => {
    const [month, day, year] = job.posted.split("/");
    const postedDate = new Date(year, month - 1, day);
    const diffDays = (today - postedDate) / (1000 * 60 * 60 * 24);

    return diffDays < config.recent_days; 
});

console.log(`Found ${recentJobs.length} recent jobs.`);

fs.writeFileSync(
    "recent_jobs.json",
    JSON.stringify(recentJobs, null, 2));

console.log("Saved recent_jobs.json");


function matchesTitleClass(job) {

    const keywords = config.title_keywords || [];

    // Empty list means no title/class filtering
    if (keywords.length === 0) return true;

    const titleClassText = [
        job.working_title,
        job.job_class]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return keywords.some(keyword =>
        titleClassText.includes(keyword.toLowerCase()))
        ;}

const positiveKeywords = config.positive_keywords;
const negativeKeywords = config.negative_keywords;

function scoreJob(job) {

    const text = [
        job.working_title,
        job.job_summary,
        job.minimum_qualifications,
        job.preferred_qualifications,
        job.additional_requirements,
        job.physical_requirements
    ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

    let score = 0;
    const matched = [];
    const avoided = [];

    // Positive keywords
    for (const [points, keywords] of Object.entries(positiveKeywords)) {
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                score += Number(points);
                matched.push({
                    keyword,
                    points: Number(points)
                });
            }}}

    // Negative keywords
    for (const [points, keywords] of Object.entries(negativeKeywords)) {
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                score += Number(points);
                avoided.push({
                    keyword,
                    points: Number(points)
                });
            }}}

    return {
        ...job,
        score,
        matched_keywords: matched,
        negative_keywords: avoided
    };
}

console.log(`Testing navigation through ${recentJobs.length} jobs...`);

const visited = [];

await jobsPage.locator("li[id^='HRS_AGNT_RSLT_I']").nth(recentJobs[0].row).click();

await jobsPage.waitForSelector(
    "text=Job Details",
    { timeout: 60000 });

async function getCurrentJobID(page) {
    const text = await page.locator("body").innerText();
    const match = text.match(/Job ID:\s*(\d+)/);

    return match ? match[1] : null;}

function extractField(text, label) {
    const match = text.match(new RegExp(`${label}:\\s*(.*)`));

    return match ? match[1].trim() : null;}

function extractSection(text, start, ends) {

    const endPattern = Array.isArray(ends)
        ? ends.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
        : ends.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const match = text.match(
        new RegExp(
            `${start}\\s*([\\s\\S]*?)\\s*(?:${endPattern})`,
            "i"));

    return match ? match[1].trim() : null;}

function parseSalary(text) {

    const match = text.match(
    /\$([\d,]+)\s*-\s*\$([\d,]+)\s*\/\s*annually/i);

    if (!match) return {
        salary_min: null,
        salary_max: null};

    return {
        salary_min: Number(match[1].replace(/,/g, "")),
        salary_max: Number(match[2].replace(/,/g, ""))};}
        
for (let i = 0; i < recentJobs.length; i++) {

    console.log(`Visiting ${i + 1} of ${recentJobs.length}`);
    await jobsPage.waitForTimeout(1000);
    const actualJobID = await getCurrentJobID(jobsPage);

const pageText = await jobsPage.locator("body").innerText();
        
const salary = parseSalary(pageText);

visited.push({
    state: "Minnesota",
    working_title: extractField(pageText, "Working Title"),
    job_class: extractField(pageText, "Job Class"),
    agency: extractField(pageText, "Agency"),
    job_id: extractField(pageText, "Job ID"),
    location: extractField(pageText, "Location"),
    telework: extractField(pageText, "Telework Eligible"),
    date_posted: extractField(pageText, "Date Posted"),
    closing_date: extractField(pageText, "Closing Date"),
    salary_range: extractField(pageText, "Salary Range"),
    salary_min: salary.salary_min,
    salary_max: salary.salary_max,

    job_summary: extractSection(
        pageText,
        "Job Summary",
        ["Minimum Qualifications", "Minimum qualifications", "Qualifications",
        "Minimum qualifications for this position include:", "Preferred Qualifications",
        "Additional Requirements", "Physical Requirements", "Application Details"]),

    essential_functions: null,
    
    minimum_qualifications: extractSection(
        pageText,
        "Minimum Qualifications",
        ["Preferred Qualifications", "Preferred qualifications",
        "Additional Requirements", "Physical Requirements",
        "Application Details", "How to Apply", "Benefits"]),

    preferred_qualifications: extractSection(
        pageText,
        "Preferred Qualifications",
        ["Additional Requirements", "Additional requirements",
        "Physical Requirements", "Physical requirements",
        "Application Details", "How to Apply", "Benefits"]),

    additional_requirements: extractSection(
        pageText,
        "Additional Requirements",
        ["Physical Requirements", "Physical requirements",
        "Application Details", "How to Apply", "Benefits"]),

    physical_requirements: extractSection(
        pageText,
        "Physical Requirements",
        ["Application Details", "How to Apply", "Benefits"]),

    url: null,
    
    page_text: pageText});
    
fs.writeFileSync(
    "job_details.json",
    JSON.stringify(visited, null, 2));

console.log(`Saved ${recentJobs[i].working_title}`);

    if (i < recentJobs.length - 1) {

        const previousJobID = actualJobID;
        let moved = false;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`Next Job attempt ${attempt}`);
            await jobsPage.getByText("Next Job").click();
            try {
                await jobsPage.waitForFunction(
                    previousID => {
                        const text = document.body.innerText;
                        const match = text.match(/Job ID:\s*(\d+)/);
                        return match && match[1] !== previousID;},
                    previousJobID,
                    { timeout: 8000 });
                moved = true;
                break;
            } catch {
                console.log("Page did not advance.");}}
        if (!moved) throw new Error(`Couldn't advance after Job ID ${previousJobID}`);}}

fs.writeFileSync(
    "job_details.json",
    JSON.stringify(visited, null, 2));

///////////////////////////////////////////////////////////
// Salary filter
///////////////////////////////////////////////////////////

const MIN_SALARY = config.minimum_salary;

const filteredJobs = visited.filter(job =>
    job.salary_max !== null &&
    job.salary_max >= MIN_SALARY&&
    matchesTitleClass(job));

console.log("Scoring...");

const scoredJobs = filteredJobs.map(scoreJob);

scoredJobs.sort((a, b) => b.score - a.score);

fs.writeFileSync(
    "filtered_jobs.json",
    JSON.stringify(scoredJobs, null, 2));

console.log(
    `Saved ${scoredJobs.length} jobs meeting salary and title/class criteria.`);
    
console.log("Report complete.");

await browser.close();

})();
