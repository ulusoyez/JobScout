# JobScout
# Automated Job Monitoring and Relevance Filtering
#
# Created by Ezgi Havsoy, PhD
# Copyright (c) 2026 Ezgi Havsoy

library(jsonlite)
library(dplyr)
library(purrr)
library(googlesheets4)

#########################################################
# Google Sheet configuration
#########################################################

sheet_id <- Sys.getenv("JOBSCOUT_SHEET_ID")

if (sheet_id == "") {
  stop(
    "Google Sheet ID not configured. ",
    "Set the JOBSCOUT_SHEET_ID environment variable before running JobScout."
  )
}

#########################################################
# Read JSON files created by JobScout
#########################################################

recent_jobs <- fromJSON(
  "job_details.json",
  flatten = TRUE
)

filtered_jobs <- fromJSON(
  "filtered_jobs.json",
  flatten = TRUE
)

#########################################################
# Prepare data for Google Sheets
#########################################################

filtered_jobs <- filtered_jobs %>%
  mutate(
    matched_keywords = map_chr(
      matched_keywords,
      ~ paste(.x, collapse = ", ")
    ),
    negative_keywords = map_chr(
      negative_keywords,
      ~ paste(.x, collapse = ", ")
    )
  )

recent_jobs <- recent_jobs %>%
  select(-page_text)

filtered_jobs <- filtered_jobs %>%
  select(-page_text)

#########################################################
# Replace Recent Jobs sheet
#########################################################

sheet_write(
  data = recent_jobs,
  ss = sheet_id,
  sheet = "Recent Jobs"
)

cat("Recent Jobs sheet updated.\n")

#########################################################
# Read existing Filtered Jobs sheet
#########################################################

existing_filtered <- read_sheet(
  ss = sheet_id,
  sheet = "Filtered Jobs"
)

#########################################################
# Validate existing sheet structure
#########################################################

if (nrow(existing_filtered) > 0 && !"job_id" %in% names(existing_filtered)) {
  stop(
    "The 'Filtered Jobs' sheet does not contain a 'job_id' column. ",
    "JobScout stopped without adding jobs to prevent duplicate records."
  )
}

#########################################################
# Determine which filtered jobs are new
#########################################################

if (nrow(existing_filtered) == 0) {
  new_jobs <- filtered_jobs
} else {
  new_jobs <- filtered_jobs %>%
    filter(
      !job_id %in% existing_filtered$job_id
    )
}

#########################################################
# Add new filtered jobs
#########################################################

if (nrow(new_jobs) > 0) {
  if (nrow(existing_filtered) == 0) {
    sheet_write(
      data = new_jobs,
      ss = sheet_id,
      sheet = "Filtered Jobs"
    )
  } else {
    sheet_append(
      ss = sheet_id,
      sheet = "Filtered Jobs",
      data = new_jobs
    )
  }
  
  cat(nrow(new_jobs), "new jobs added.\n")
} else {
  cat("No new jobs found.\n")
}

#########################################################
# Summary
#########################################################

cat("\n----------------------------\n")

cat(
  "Recent jobs scraped: ",
  nrow(recent_jobs),
  "\n",
  sep = ""
)

cat(
  "Filtered jobs this run: ",
  nrow(filtered_jobs),
  "\n",
  sep = ""
)

cat(
  "New filtered jobs added: ",
  nrow(new_jobs),
  "\n",
  sep = ""
)

cat(
  "Jobs currently in Google Sheet: ",
  nrow(existing_filtered) + nrow(new_jobs),
  "\n",
  sep = ""
)

cat("----------------------------\n")