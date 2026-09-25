/**
 * JobScout
 * Automated Job Monitoring and Relevance Filtering
 *
 * Created by Ezgi Havsoy, PhD
 * Copyright (c) 2026 Ezgi Havsoy
 *
 * Michigan state job scraper
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

///////////////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////////////

function parseMichiganDate(dateText) {
    if (!dateText) return null;

    const date = new Date(dateText);
    return Number.isNaN(date.getTime()) ? null : date;}

function isRecent(dateText) {
    const postedDate = parseMichiganDate(dateText);
    if (!postedDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    postedDate.setHours(0, 0, 0, 0);

    const diffDays = (today - postedDate) / (1000 * 60 * 60 * 24);
    return diffDays < config.recent_days;}

function extractField(text, labels) {
    if (!Array.isArray(labels)) labels = [labels];

    const lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`^${escaped}\\s*:?\\s*(.*)$`, "i");

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(pattern);
            if (!match) continue;

            if (match[1]?.trim()) return match[1].trim();
            if (lines[i + 1]) return lines[i + 1].trim();}}

    return null;}

function extractSection(text, starts, ends) {
    if (!Array.isArray(starts)) starts = [starts];
    if (!Array.isArray(ends)) ends = [ends];

    const normalized = text.replace(/\r/g, "");
    let startIndex = -1;
    let matchedStart = null;

    for (const start of starts) {
        const index = normalized.toLowerCase().indexOf(start.toLowerCase());
        if (index !== -1) {
            startIndex = index;
            matchedStart = start;
            break;}}

    if (startIndex === -1) return null;

    const contentStart = startIndex + matchedStart.length;
    let contentEnd = normalized.length;

    for (const end of ends) {
        const index = normalized.toLowerCase().indexOf(
            end.toLowerCase(),
            contentStart);

        if (index !== -1 && index < contentEnd) contentEnd = index;}

    const section = normalized.slice(contentStart, contentEnd).trim();
    return section || null;}

function parseSalary(text) {
    if (!text) return {
        salary_min: null,
        salary_max: null};

    const clean = text.replace(/,/g, "");

    // Annual range
    const annualMatch = clean.match(
        /\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*)?(?:per\s*)?(?:year|annually|annual|yr)/i);

    if (annualMatch) return {
        salary_min: Number(annualMatch[1]),
        salary_max: Number(annualMatch[2])};

    // Biweekly range
    const biweeklyMatch = clean.match(
        /\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*)?(?:per\s*)?(?:biweekly|bi-weekly)/i);

    if (biweeklyMatch) return {
        salary_min: Number(biweeklyMatch[1]) * 26,
        salary_max: Number(biweeklyMatch[2]) * 26};

    // Monthly range
    const monthlyMatch = clean.match(
        /\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*)?(?:per\s*)?(?:month|monthly)/i);

    if (monthlyMatch) return {
        salary_min: Number(monthlyMatch[1]) * 12,
        salary_max: Number(monthlyMatch[2]) * 12};

    // Hourly range
    const hourlyMatch = clean.match(
        /\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*)?(?:per\s*)?(?:hour|hourly)/i);

    if (hourlyMatch) return {
        salary_min: Number(hourlyMatch[1]) * 2080,
        salary_max: Number(hourlyMatch[2]) * 2080};

    return {
        salary_min: null,
        salary_max: null};}

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
        job.essential_functions,
        job.minimum_qualifications,
        job.preferred_qualifications,
        job.additional_requirements,
        job.physical_requirements]
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
                    points: Number(points)});}}}

    // Negative keywords
    for (const [points, keywords] of Object.entries(negativeKeywords)) {
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                score += Number(points);
                avoided.push({
                    keyword,
                    points: Number(points)});}}}

    return {
        ...job,
        score,
        matched_keywords: matched,
        negative_keywords: avoided};}

///////////////////////////////////////////////////////
// Open Michigan Careers
///////////////////////////////////////////////////////

(async () => {

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Opening Michigan Careers...");

    await page.goto(
        "https://www.governmentjobs.com/careers/michigan",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000 });

    await page.waitForSelector(
        "a.item-details-link:visible",
        { timeout: 60000 });

    console.log("Jobs loaded.");

    ///////////////////////////////////////////////////////
    // Extract recent job listings
    ///////////////////////////////////////////////////////

    const recentJobs = [];
    const seenUrls = new Set();

    let pageNumber = 1;
    let keepGoing = true;

    while (keepGoing) {

        console.log(`Reading search results page ${pageNumber}...`);

        await page.waitForSelector(
            "a.item-details-link:visible",
            { timeout: 30000 });

        const jobs = await page.evaluate(() => {

            const links = [...document.querySelectorAll("a.item-details-link")]
                .filter(link => {
                    const rect = link.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;});

            return links.map(link => {
                const row = link.closest("tr");
                const cells = row
                    ? [...row.querySelectorAll("td")].map(cell => cell.innerText.trim())
                    : [];

                const text = row?.innerText || "";
                const postedMatch = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g);

                return {
                    state: "Michigan",
                    working_title: link.innerText.trim(),
                    job_id: cells.length ? cells[cells.length - 1] : null,
                    location: cells.length > 6 ? cells[6] : null,
                    agency: cells.length > 5 ? cells[5] : null,
                    posted: postedMatch?.length ? postedMatch[postedMatch.length - 1] : null,
                    url: new URL(link.href, window.location.origin).href.split("?")[0]};})
                .filter(job => job.working_title && job.url);});

        let foundRecent = false;

        for (const job of jobs) {
            if (seenUrls.has(job.url)) continue;
            seenUrls.add(job.url);

            if (isRecent(job.posted)) {
                recentJobs.push(job);
                foundRecent = true;}}

        console.log(`Found ${jobs.length} jobs on page.`);
        console.log(`Collected ${recentJobs.length} recent jobs.`);

        // Stop once the current page contains no recent jobs
        if (!foundRecent) break;

        const nextButton = page.locator(
            'a[aria-label="Go to Next Page"]:visible'
        ).first();
        
        if (await nextButton.count() === 0 ||
            await nextButton.getAttribute("aria-disabled") === "true") {
            keepGoing = false;
            break;}
        
        const firstUrl = jobs[0]?.url;
        
        await nextButton.click();

        await page.waitForFunction(
            previousUrl => {
                const link = document.querySelector("a.item-details-link");
                if (!link) return false;

                return link.href.split("?")[0] !== previousUrl;},
            firstUrl,
            { timeout: 30000 });

        pageNumber++;}

    console.log(`Found ${recentJobs.length} recent Michigan jobs.`);

    fs.writeFileSync(
        "recent_jobs.json",
        JSON.stringify(recentJobs, null, 2));

    console.log("Saved recent_jobs.json");

    ///////////////////////////////////////////////////////
    // Visit job details
    ///////////////////////////////////////////////////////
    
    const visited = [];
    
    if (recentJobs.length > 0) {
        for (let i = 0; i < recentJobs.length; i++) {
            const job = recentJobs[i];
    
            console.log(`Visiting ${i + 1} of ${recentJobs.length}: ${job.working_title}`);
    
            await page.goto(job.url, {
                waitUntil: "domcontentloaded",
                timeout: 60000 });
    
            await page.locator("#details-info").waitFor({
                state: "visible",
                timeout: 30000 });
    
            const summary = page.locator("div.summary.container").first();
            const details = page.locator("#details-info");
    
            const summaryText = await summary.innerText();
            const detailsText = await details.innerText();
            const pageText = `${summaryText}\n\n${detailsText}`;
    
            const salaryRange = extractField(summaryText, "Salary");
            const salary = parseSalary(salaryRange);
    
            const alternateEducation = extractSection(
                detailsText,
                "Alternate Education and Experience",
                ["Additional Requirements and Information"]);
    
            const additionalRequirements = extractSection(
                detailsText,
                "Additional Requirements and Information",
                []);
    
            visited.push({
                state: "Michigan",
                working_title: job.working_title,
                job_class: null,
                agency: extractField(summaryText, "Department") || job.agency,
                job_id: extractField(summaryText, "Job Number") || job.job_id,
                location: extractField(summaryText, "Location") || job.location,
                telework: extractField(summaryText, "Remote Employment"),
                date_posted: extractField(summaryText, "Opening Date") || job.posted,
                closing_date: extractField(summaryText, "Closing Date"),
                salary_range: salaryRange,
                salary_min: salary.salary_min,
                salary_max: salary.salary_max,
                job_summary: extractSection(
                    detailsText,
                    "Job Description",
                    ["Required Education and Experience",
                    "Alternate Education and Experience",
                    "Additional Requirements and Information"]),
                essential_functions: null,
                minimum_qualifications: extractSection(
                    detailsText,
                    "Required Education and Experience",
                    ["Alternate Education and Experience",
                    "Additional Requirements and Information"]),
                preferred_qualifications: null,
                additional_requirements: [
                    alternateEducation,
                    additionalRequirements]
                    .filter(Boolean)
                    .join("\n\n") || null,
                physical_requirements: null,
                url: job.url,
                page_text: pageText});
    
            fs.writeFileSync(
                "job_details.json",
                JSON.stringify(visited, null, 2));
    
            console.log(`Saved ${job.working_title}`);}}
    
    fs.writeFileSync(
        "job_details.json",
        JSON.stringify(visited, null, 2));

    ///////////////////////////////////////////////////////
    // Salary filter
    ///////////////////////////////////////////////////////

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