/**
 * JobScout
 * Automated Job Monitoring and Relevance Filtering
 *
 * Created by Ezgi Havsoy, PhD
 * Copyright (c) 2026 Ezgi Havsoy
 *
 * Illinois state job scraper
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

function parseIllinoisDate(dateText) {
    if (!dateText) return null;

    const date = new Date(dateText);
    return Number.isNaN(date.getTime()) ? null : date;}

function isRecent(dateText) {
    const postedDate = parseIllinoisDate(dateText);
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

function cleanAdditionalRequirements(text) {
    if (!text) return null;

    const stopPatterns = [
        /\nThe Department of .+? is the state's/i,
        /\nThe Department of .+? is seeking/i,
        /\nThe Illinois Department of .+? is seeking/i
    ];

    let cleaned = text;

    for (const pattern of stopPatterns) {
        const match = cleaned.match(pattern);
        if (match) cleaned = cleaned.slice(0, match.index);}

    return cleaned.trim() || null;}
    
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

    // Annual range inside parentheses
    const annualAnywhere = clean.match(
        /\(\s*\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*)?(?:per\s*)?(?:year|annually|annual|yr)/i);

    if (annualAnywhere) return {
        salary_min: Number(annualAnywhere[1]),
        salary_max: Number(annualAnywhere[2])};

    // Full monthly range
    const fullMonthly = clean.match(
        /Full\s*Range\s*:?\s*\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)\s*(?:\/\s*)?(?:per\s*)?(?:month|monthly)?/i);

    if (fullMonthly) return {
        salary_min: Number(fullMonthly[1]) * 12,
        salary_max: Number(fullMonthly[2]) * 12};

    // Standard monthly range
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
// Open Illinois Careers
///////////////////////////////////////////////////////

(async () => {

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Opening Illinois Careers...");

    await page.goto(
        "https://illinois.jobs2web.com/search/",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000 });

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
            'a[href*="/job/"]',
            { timeout: 30000 });

        const jobs = await page.evaluate(() => {

            const links = [...document.querySelectorAll('a[href*="/job/"]')];

            const uniqueLinks = [...new Map(
                links.map(link => [link.href, link])
            ).values()];
            
            return uniqueLinks.map(link => {
                const container =
                    link.closest("li") ||
                    link.closest("tr") ||
                    link.parentElement?.parentElement;

                const text = container?.innerText || "";

                const dateMatch = text.match(
                    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i);

                const jobIDMatch = text.match(
                    /Job Requisition ID\s*:?\s*(\d+)/i);

                const agencyMatch = text.match(
                    /Agency\s*:?\s*([^\n]+)/i);

                const locationMatch = text.match(
                    /Location\s*:?\s*([^\n]+)/i);

                return {
                    state: "Illinois",
                    working_title: link.innerText.trim(),
                    job_id: jobIDMatch ? jobIDMatch[1] : null,
                    location: locationMatch ? locationMatch[1].trim() : null,
                    agency: agencyMatch ? agencyMatch[1].trim() : null,
                    posted: dateMatch ? dateMatch[0] : null,
                    url: link.href};})
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

        // Stop once the current batch contains no recent jobs
        if (!foundRecent) break;
        
        const moreResults = page.getByText("More Search Results", { exact: true });
        
        if (await moreResults.count() === 0) {
            keepGoing = false;
            break;}
        
        const previousCount = jobs.length;
        
        await moreResults.click();
        
        await page.waitForFunction(
            previousCount => {
                const links = [...document.querySelectorAll('a[href*="/job/"]')];
                const uniqueUrls = new Set(links.map(link => link.href));
                return uniqueUrls.size > previousCount;},
            previousCount,
            { timeout: 30000 });
        
        pageNumber++;}

    console.log(`Found ${recentJobs.length} recent Illinois jobs.`);

    fs.writeFileSync(
        "recent_jobs.json",
        JSON.stringify(recentJobs, null, 2));

    console.log("Saved recent_jobs.json");

    ///////////////////////////////////////////////////////
    // Visit job detail pages
    ///////////////////////////////////////////////////////

    const visited = [];

    for (let i = 0; i < recentJobs.length; i++) {

        const listing = recentJobs[i];

        console.log(`Visiting ${i + 1} of ${recentJobs.length}`);

        await page.goto(
            listing.url,
            {
                waitUntil: "domcontentloaded",
                timeout: 60000 });

        const pageText = await page.locator("body").innerText();
        const salaryRange = extractField(pageText, "Salary");
        const salary = parseSalary(salaryRange);

        visited.push({
            state: "Illinois",
            working_title: listing.working_title,
            job_class: extractField(pageText, ["Class Title", "Position Title", "Positon Title"]),
            agency: extractField(pageText, "Agency") || listing.agency,
            job_id: extractField(pageText, "Job Requisition ID") || listing.job_id,
            location: extractField(
                pageText,
                ["Headquarter Location", "Headquarters Location", "Work Location"]) || listing.location,
            telework: extractField(
              pageText,
              ["Anticipated Hybrid Work Schedule Availability"]),
            date_posted: extractField(
                pageText,
                ["Opening Date", "Opening  Date"]) || listing.posted,
            closing_date: extractField(pageText, "Closing Date"),
            salary_range: salaryRange,
            salary_min: salary.salary_min,
            salary_max: salary.salary_max,
            
            job_summary: extractSection(
                pageText,
                ["Position Overview", "ABOUT THE POSITION", "About the Position"],
                ["Essential Functions", "Job Responsibilities", "Minimum Qualification",
                "Minimum Qualifications", "Minimum Requirements", "Preferred Qualifications",
                "Specialized Skills", "Conditions of Employment"]),

            essential_functions: extractSection(
                pageText,
                ["Essential Functions", "Job Responsibilities"],
                ["Minimum Qualifications", "Minimum Qualification",
                "Minimum Requirements", "Preferred Qualifications",
                "Preferred Qualification", "Specialized Skills",
                "Conditions of Employment"]),
            
            minimum_qualifications: extractSection(
                pageText,
                ["Minimum Qualifications", "Minimum Qualification", "Minimum Requirements"],
                ["Preferred Qualifications", "Preferred Qualification", "Specialized Skills",
                "Conditions of Employment", "Work Hours", "Headquarter Location",
                "Headquarters Location", "Work Location"]),
            
            preferred_qualifications: extractSection(
                pageText,
                ["Preferred Qualifications", "Preferred Qualification"],
                ["Specialized Skills", "Conditions of Employment", "Work Hours",
                "Headquarter Location", "Headquarters Location", "Work Location"]),
            
            additional_requirements: cleanAdditionalRequirements([
                extractSection(
                    pageText,
                    "Specialized Skills",
                    ["Conditions of Employment", "Work Hours", "Headquarter Location",
                    "Headquarters Location", "Work Location", "Work County",
                    "Agency Contact", "Posting Group", "About the Agency",
                    "Agency Mission", "Agency Statement", "Revolving Door:",
                    "Statement of Economic Interests:", "Term Appointment:",
                    "APPLICATION INSTRUCTIONS", "Application Instructions",
                    "Nearest Major Market", "Apply »"]),
                extractSection(
                    pageText,
                    "Conditions of Employment",
                    ["Work Hours", "Headquarter Location", "Headquarters Location",
                    "Work Location", "Work County", "Agency Contact", "Posting Group",
                    "About the Agency", "Agency Mission", "Agency Statement",
                    "Revolving Door:", "Statement of Economic Interests:",
                    "Term Appointment:", "APPLICATION INSTRUCTIONS",
                    "Application Instructions", "Nearest Major Market", "Apply »"])]
                .filter(Boolean)
                .join("\n\n") || null),
            
            physical_requirements: null,
            url: listing.url,
            page_text: pageText});

        console.log(`Saved ${listing.working_title}`);}

    fs.writeFileSync(
        "job_details.json",
        JSON.stringify(visited, null, 2));

    ///////////////////////////////////////////////////////
    // Salary filter
    ///////////////////////////////////////////////////////

    const MIN_SALARY = config.minimum_salary;

    const filteredJobs = visited.filter(job =>
        job.salary_max !== null &&
        job.salary_max >= MIN_SALARY);

    console.log("Scoring...");

    const scoredJobs = filteredJobs.map(scoreJob);

    scoredJobs.sort((a, b) => b.score - a.score);

    fs.writeFileSync(
        "filtered_jobs.json",
        JSON.stringify(scoredJobs, null, 2));

    console.log(
        `Saved ${scoredJobs.length} jobs with salary >= $${MIN_SALARY.toLocaleString()}.`);

    console.log("Report complete.");

    await browser.close();

})();