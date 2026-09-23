# JobScout
# Automated Job Monitoring and Relevance Filtering
#
# Created by Ezgi Havsoy, PhD
# Copyright (c) 2026 Ezgi Havsoy


library(processx)


run_jobscout <- function(state = "minnesota") {
  
  ################################################################
  # Validate state
  ################################################################
  
  state <- tolower(state)
  
  # Add additional states to this list as they are implemented.
  supported_states <- c(
    "minnesota",
    "illinois"
  )
  
  if (!state %in% supported_states) {
    stop(
      "Unsupported state: ", state,
      ". Supported states are: ",
      paste(supported_states, collapse = ", ")
    )
  }
  
  cat("=====================================\n")
  cat("JobScout started:", as.character(Sys.time()), "\n")
  cat("State:", tools::toTitleCase(state), "\n")
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
    args = c(
      "Source/job_scraper.js",
      "--state",
      state
    ),
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
}