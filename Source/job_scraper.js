/**
 * JobScout
 * Automated Job Monitoring and Relevance Filtering
 *
 * Created by Ezgi Havsoy, PhD
 * Copyright (c) 2026 Ezgi Havsoy
 *
 * This script selects and runs the appropriate state-specific
 * job scraper.
 */

const path = require("path");

///////////////////////////////////////////////////////
// Determine state
///////////////////////////////////////////////////////

const stateArgIndex = process.argv.indexOf("--state");

const state = stateArgIndex !== -1
    ? process.argv[stateArgIndex + 1]?.toLowerCase()
    : "minnesota";

///////////////////////////////////////////////////////
// Supported state scrapers
///////////////////////////////////////////////////////

// Add additional state scrapers to this list as they are implemented.
const scrapers = {
    minnesota: "./scrapers/minnesota.js",
    illinois: "./scrapers/illinois.js"
};

if (!scrapers[state]) {
    throw new Error(
        `Unsupported state: ${state}. ` +
        `Supported states are: ${Object.keys(scrapers).join(", ")}`
    );
}

///////////////////////////////////////////////////////
// Run selected scraper
///////////////////////////////////////////////////////

console.log(`JobScout state: ${state}`);

const scraperPath = path.join(
    __dirname,
    scrapers[state]
);

require(scraperPath);