# JobScout
# Automated Job Monitoring and Relevance Filtering
#
# Created by Ezgi Havsoy, PhD
# Copyright (c) 2026 Ezgi Havsoy


library(processx)

cat("=====================================\n")
cat("JobScout started:", as.character(Sys.time()), "\n")
cat("=====================================\n")

################################################################
# Check that Node.js is available
################################################################

node <- Sys.which("node")

if (node == "") {
  stop(
    "Node.js could not be found. ",
    "Please install Node.js and make sure it is available on your system PATH."
  )
}

cat("Node.js found:", node, "\n")

################################################################
# Run job scraper
################################################################

processx::run(
  command = node,
  args = "Source/job_scraper.js",
  echo = TRUE,
  error_on_status = TRUE
)

################################################################
# Update Google Sheets
################################################################

source("R/update_google_sheet.R")

cat("=====================================\n")
cat("JobScout completed:", as.character(Sys.time()), "\n")
cat("=====================================\n")