# JobScout

**Automated Job Monitoring and Relevance Filtering**

Created by **Ezgi Havsoy, PhD**  
Copyright © 2026 Ezgi Havsoy

## Overview

JobScout is an automated job-monitoring tool that retrieves recently posted jobs, extracts information from individual job postings, filters positions according to user-defined criteria, scores jobs based on keyword relevance, and saves the results to Google Sheets.

The tool was originally developed to reduce the amount of repetitive manual work involved in monitoring new job postings and identifying positions that may be worth reviewing.

The current version is designed for the **State of Minnesota Careers website**.

## What JobScout Does

When JobScout runs, it:

1. Opens the State of Minnesota Careers website.
2. Loads the available job postings.
3. Identifies jobs posted within a user-defined number of recent days.
4. Opens each recent job posting and extracts information including:
   - Working title
   - Job class
   - Agency
   - Job ID
   - Location
   - Telework eligibility
   - Posting and closing dates
   - Salary range
   - Job summary
   - Minimum qualifications
   - Preferred qualifications
   - Additional requirements
   - Physical requirements
5. Removes jobs whose advertised salary range does not reach the user's configured salary threshold.
6. Scores the remaining jobs using user-defined positive and negative keywords.
7. Ranks the jobs by relevance score.
8. Updates a Google Sheet containing:
   - Recently scraped jobs
   - Filtered jobs that meet the user's criteria
9. Prevents previously recorded filtered jobs from being repeatedly added to the historical job list.

## How It Works

JobScout uses two programming environments:

- **JavaScript / Node.js / Playwright** handles browser automation, job retrieval, page navigation, information extraction, filtering, and relevance scoring.
- **R** manages the workflow and sends the resulting data to Google Sheets.

The basic workflow is:

```text
State of Minnesota Careers
          ↓
   Playwright scraper
          ↓
  Recent job postings
          ↓
 Job-detail extraction
          ↓
    Salary filtering
          ↓
   Keyword scoring
          ↓
     JSON outputs
          ↓
      R processing
          ↓
     Google Sheets
```

## Project Structure

```text
JobScout/
│
├── R/
│   ├── Run_JobScout.R
│   └── update_google_sheet.R
│
├── Source/
│   └── job_scraper.js
│
├── config/
│   ├── config.example.json
│   └── config.json
│
├── .gitignore
├── README.md
├── package.json
└── package-lock.json
```

### Important

`config.json` contains each user's personal JobScout settings and is intentionally excluded from GitHub.

The repository includes `config.example.json` instead. Each user creates their own `config.json` from this example.

---

# Installation and Setup

## Step 1: Download JobScout

Clone this repository using Git:

```bash
git clone YOUR-REPOSITORY-URL
```

Alternatively, use GitHub's **Code → Download ZIP** option and extract the folder to your computer.

Open the resulting `JobScout` folder.

---

## Step 2: Install Node.js

JobScout uses Node.js to run the Playwright-based job scraper.

Download and install a current version of Node.js from the official Node.js website.

After installation, open a new terminal and verify that Node.js is available:

```bash
node --version
```

You should see the installed Node.js version.

You can also verify that npm is available:

```bash
npm --version
```

npm is included with Node.js and is used to install JobScout's JavaScript dependencies.

> **Windows PowerShell:** Depending on your PowerShell execution policy, running `npm` may produce an error indicating that `npm.ps1` cannot be loaded. If this occurs, use:
>
> ```powershell
> npm.cmd --version
> ```
>
> You do not need to change your PowerShell execution policy to use JobScout.

---

## Step 3: Install the JavaScript Dependencies

Open a terminal in the main `JobScout` folder and run:

```bash
npm install
```

This installs the packages listed in `package.json`, including Playwright.

### Install the Playwright Browser

Playwright requires a browser installation in addition to the JavaScript package. JobScout uses Chromium to interact with the State of Minnesota Careers website.

After installing the Node.js dependencies, run:

```bash
npx playwright install chromium
```

This downloads the Chromium browser used by Playwright. This step is generally required during the initial setup and may need to be repeated if a future Playwright update requires a newer browser version.

> **Windows PowerShell:** If PowerShell prevents `npm` or `npx` from running because of its script execution policy, use the `.cmd` versions instead:
>
> ```powershell
> npm.cmd install
> npx.cmd playwright install chromium
> ```
>
> JobScout does not require users to change their PowerShell execution policy.

The generated `node_modules` folder contains the locally installed JavaScript dependencies. It is intentionally excluded from GitHub and should not be manually copied between computers.
---

## Step 4: Install R

Install R if it is not already installed.

RStudio is optional but recommended.

---

## Step 5: Install the Required R Packages

Open R or RStudio and run:

```r
install.packages(
  c(
    "processx",
    "jsonlite",
    "dplyr",
    "purrr",
    "googlesheets4"
  )
)
```

This only needs to be done once per R installation.

---

# Configure Your Job Search

## Step 6: Create Your Personal Configuration File

Navigate to:

```text
config/
```

The repository contains:

```text
config.example.json
```

Make a copy of this file and rename the copy:

```text
config.json
```

Do **not** delete `config.example.json`.

Your folder should now contain:

```text
config/
├── config.example.json
└── config.json
```

`config.json` is excluded from GitHub so that each user can maintain their own search preferences.

---

## Step 7: Customize Your Search Criteria

Open:

```text
config/config.json
```

The configuration contains settings similar to:

```json
{
  "recent_days": 7,
  "minimum_salary": 80000,

  "positive_keywords": {
    "10": [
      "data analyst",
      "statistical analyst",
      "research analyst",
      "business intelligence analyst"
    ],

    "5": [
      "SQL",
      "Python",
      "R programming",
      "statistical analysis",
      "data analysis"
    ],

    "2": [
      "analytics",
      "statistics",
      "automation",
      "Git",
      "API"
    ]
  },

  "negative_keywords": {
    "-10": [
      "registered nurse",
      "physician",
      "licensed practical nurse",
      "social worker"
    ],

    "-5": [
      "electrician",
      "mechanic",
      "custodian",
      "correctional officer"
    ]
  }
}
```

### `recent_days`

Controls how recently a job must have been posted to be reviewed.

For example:

```json
"recent_days": 7
```

tells JobScout to examine jobs posted within the configured seven-day window.

### `minimum_salary`

Sets the salary threshold used to filter job postings.

JobScout evaluates the **maximum annual salary in the advertised salary range**. A job is retained when the upper end of its salary range is equal to or greater than the configured threshold.

For example:

```json
"minimum_salary": 80000
```

With this setting:

- A job with a salary range of **$65,000–$85,000** would be retained because the range reaches above $80,000.
- A job with a salary range of **$80,000–$95,000** would be retained.
- A job with a salary range of **$55,000–$75,000** would be excluded because the entire advertised range is below $80,000.

Therefore, `minimum_salary` does **not** require the starting salary to be at least the specified amount. It is used to exclude positions whose **entire advertised salary range falls below the user's salary threshold**.

### `positive_keywords`

Positive keywords increase a job's relevance score.

For example:

```json
"10": [
  "data analyst",
  "statistical analyst"
]
```

adds 10 points when one of those phrases is found in the job information examined by JobScout.

Different point values can be used to represent different levels of relevance.

### `negative_keywords`

Negative keywords decrease the relevance score.

For example:

```json
"-10": [
  "registered nurse",
  "physician"
]
```

subtracts 10 points when those terms appear.

These criteria should be customized to reflect the user's own experience, interests, skills, and job-search priorities.

---

# Set Up Google Sheets

## Step 8: Create a Google Sheet

Create a new Google Sheet that JobScout can use for its results.

Create two worksheets/tabs with these exact names:

```text
Recent Jobs
Filtered Jobs
```

The names must match because JobScout uses them when writing the results.

---

## Step 9: Find Your Google Sheet ID

Open the Google Sheet.

A Google Sheets URL generally looks like:

```text
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
```

The portion between `/d/` and `/edit` is the Google Sheet ID.

For example:

```text
https://docs.google.com/spreadsheets/d/ABC123XYZ/edit
```

has the Sheet ID:

```text
ABC123XYZ
```

Do not put this ID directly into the JobScout source code.

---

## Step 10: Set the Google Sheet Environment Variable

JobScout looks for an environment variable named:

```text
JOBSCOUT_SHEET_ID
```

For a temporary R session, it can be set with:

```r
Sys.setenv(
  JOBSCOUT_SHEET_ID = "YOUR_GOOGLE_SHEET_ID"
)
```

Replace `YOUR_GOOGLE_SHEET_ID` with the ID from your own Google Sheet.

This value must be available when JobScout runs.

For repeated use, users may prefer to store this environment variable through their local R environment configuration rather than entering it manually each session.

**Do not commit personal Google Sheet IDs, credentials, or authentication information to GitHub.**

---

## Step 11: Authenticate Google Sheets

The first time JobScout accesses Google Sheets, `googlesheets4` may open a browser and ask you to authenticate with your Google account.

Log into the Google account that has access to the Google Sheet you created and approve the requested access.

Authentication is handled locally and should not be added to the GitHub repository.

---

# Run JobScout

## Step 12: Open the Project Directory

Before running JobScout, make sure the working directory is the main `JobScout` directory.

For example, in RStudio you can open the project folder and verify the working directory using:

```r
getwd()
```

The working directory should be the folder containing:

```text
R/
Source/
config/
package.json
README.md
```

---

## Step 13: Run the Pipeline

From the main JobScout directory, run:

```r
source("R/Run_JobScout.R")
```

JobScout will:

1. Verify that Node.js is available.
2. Start the Playwright scraper.
3. Open the State of Minnesota Careers website.
4. Retrieve recent job postings.
5. Visit the individual job pages.
6. Extract job information.
7. Apply the configured salary filter.
8. Calculate relevance scores.
9. Create local JSON output files.
10. Update the configured Google Sheet.

The browser window may be visible while Playwright is working. This is expected.

---

# Understanding the Results

## Recent Jobs

The `Recent Jobs` worksheet is replaced during each run.

It represents the recent job postings examined during the current JobScout run.

## Filtered Jobs

The `Filtered Jobs` worksheet functions as a cumulative history.

JobScout compares the current filtered results with jobs already stored in the worksheet using the Job ID.

Only jobs that are not already present are added.

This allows the worksheet to function as an ongoing record of potentially relevant opportunities.

## Relevance Score

JobScout assigns each filtered job a relevance score based on the positive and negative keywords specified in `config.json`.

A higher score means that more positively weighted terms were detected in the job information.

The score is a screening aid, not an assessment of whether someone is qualified for a position or whether they should apply. Users should review the actual job posting before making application decisions.

---

# Files Created During a Run

JobScout creates local JSON files such as:

```text
recent_jobs.json
job_details.json
filtered_jobs.json
```

These files are intermediate/output data used by the pipeline.

They are intentionally excluded from GitHub because they may contain information specific to an individual's job search.

They can be regenerated by running JobScout again.

---

# Privacy and Version Control

The public/shareable repository is intended to contain the JobScout program, not an individual's job-search history or personal configuration.

The `.gitignore` file therefore excludes items such as:

```text
config/config.json
node_modules/
recent_jobs.json
job_details.json
filtered_jobs.json
.env
.Renviron
```

Before committing changes to GitHub, users should verify that personal configuration files, credentials, authentication information, and generated job-search data are not being tracked.

---

# Troubleshooting

## Node.js could not be found

If JobScout reports that Node.js cannot be found, verify installation by running:

```bash
node --version
```

If no version is returned, Node.js may not be installed or may not be available on the system PATH.

## Playwright or Chromium is missing

Run:

```bash
npm install
```

and, if necessary:

```bash
npx playwright install chromium
```

## Google Sheet ID not configured

Make sure the following environment variable has been set:

```text
JOBSCOUT_SHEET_ID
```

In R, you can check it with:

```r
Sys.getenv("JOBSCOUT_SHEET_ID")
```

## Google Sheets access fails

Make sure:

1. You authenticated `googlesheets4`.
2. You authenticated with the correct Google account.
3. That account has access to the target Google Sheet.
4. The Sheet ID is correct.
5. The workbook contains `Recent Jobs` and `Filtered Jobs` worksheets.

## JobScout stops while navigating job postings

The State of Minnesota Careers website can change over time. JobScout relies on the website's current page structure and text labels, so changes to that website may require updates to the scraper.

## Human Verification Appears

Occasionally, the State of Minnesota Careers website may display a human verification or bot-detection check when JobScout opens the site.

If this occurs:

1. Complete the verification manually in the browser window opened by JobScout.
2. Allow the website to finish loading.
3. JobScout should then be able to continue with the job search.

This behavior is controlled by the State of Minnesota Careers website and may occur inconsistently. It does not necessarily indicate a problem with the JobScout installation.

---

# Current Scope and Limitations

JobScout is currently designed specifically for the State of Minnesota Careers website.

Because JobScout relies on the structure and behavior of an external website, changes to the State of Minnesota Careers website may affect the scraper or require updates to the extraction process.

In some cases, the State of Minnesota Careers website may display a **human verification or bot-detection check** when JobScout first opens the site. This occurs only occasionally. If a verification prompt appears, the user must complete it manually in the browser before JobScout can continue. JobScout is not designed to bypass these protections.

The relevance score is based on keyword occurrence. It should therefore be treated as a prioritization mechanism rather than a comprehensive assessment of job fit.

Salary filtering depends on JobScout being able to identify and parse an annual salary range from the job posting.

---

# Intended Use and Disclaimer

JobScout was developed as a personal, noncommercial automation project for monitoring publicly available job postings.

The project retrieves information made publicly available through the State of Minnesota Careers website. It does not submit job applications, modify information on the State of Minnesota website, or access non-public areas of the site.

JobScout relies on an external website that is not controlled by the developer. Users are responsible for ensuring that their use of the software complies with applicable website terms, policies, and laws.

The State of Minnesota Careers website may occasionally require human verification. JobScout is not designed to bypass these protections. If verification is requested, the user must complete it manually before the automated process can continue.

This project is provided for informational and educational purposes and is not affiliated with, endorsed by, or maintained by the State of Minnesota.

---

# Author

**Ezgi Havsoy, PhD**

JobScout was created and developed by Ezgi Havsoy as an automation tool for monitoring, filtering, and organizing job opportunities.

If you share or adapt this project, please retain attribution to the original author.

Copyright © 2026 Ezgi Havsoy.

---

# License

See the `LICENSE` file for information about permitted use, modification, and redistribution.

