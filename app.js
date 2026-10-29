"use strict";

const records = document.getElementById("records");
const count = document.getElementById("count");
const status = document.getElementById("status");
const retry = document.getElementById("retry");
const table = document.getElementById("students");

const fields = [
    "id",
    "created_at",
    "studentname",
    "schoolname",
    "organizer",
    "issuedate"
];

// Display a message inside the table
function showMessage(message) {
    if (!records) {
        console.error("HTML element #records was not found.");
        return;
    }

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = fields.length;
    cell.className = "empty";
    cell.textContent = message;

    row.appendChild(cell);
    records.replaceChildren(row);
}

// Display errors
function showError(error) {
    console.error("Yoga Student Records Error:", error);

    if (status) {
        if (error.name === "AbortError") {
            status.textContent =
                "Request timed out. Please check your connection and retry.";
        } else if (error instanceof TypeError) {
            status.textContent =
                "Unable to connect. Check your internet and Supabase configuration.";
        } else {
            status.textContent =
                error.message || "An unexpected error occurred.";
        }
    }

    showMessage("Student records could not be loaded.");

    if (retry) {
        retry.hidden = false;
    }
}

// Load student records from Supabase
async function loadStudents() {
    // Validate required HTML elements
    if (!records || !count || !status || !retry || !table) {
        const missing = [];

        if (!records) missing.push("#records");
        if (!count) missing.push("#count");
        if (!status) missing.push("#status");
        if (!retry) missing.push("#retry");
        if (!table) missing.push("#students");

        console.error("Missing HTML elements:", missing.join(", "));

        if (status) {
            status.textContent =
                "Error: Missing HTML elements: " + missing.join(", ");
        }

        if (records) {
            showMessage("Please check the HTML element IDs.");
        }

        return;
    }

    retry.hidden = true;
    table.setAttribute("aria-busy", "true");
    count.textContent = "—";
    status.textContent = "Connecting to Supabase...";
    showMessage("Loading student records...");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
        // Validate configuration
        const config = window.YOGA_CONFIG;

        if (!config) {
            throw new Error(
                "Configuration not found. Check that config.js loads before script.js."
            );
        }

        if (!config.supabaseUrl || !config.supabasePublishableKey) {
            throw new Error(
                "Supabase URL or publishable key is missing in config.js."
            );
        }

        // Validate Supabase URL
        let supabaseUrl;

        try {
            supabaseUrl = new URL(config.supabaseUrl);
        } catch {
            throw new Error("Invalid Supabase URL in config.js.");
        }

        if (
            supabaseUrl.protocol !== "https:" ||
            !supabaseUrl.hostname.endsWith(".supabase.co")
        ) {
            throw new Error(
                "Use the correct HTTPS Supabase project URL."
            );
        }

        // Build API endpoint
        const endpoint = new URL(
            "/rest/v1/student_yoga",
            supabaseUrl.origin
        );

        endpoint.searchParams.set("select", fields.join(","));
        endpoint.searchParams.set("order", "created_at.desc");

        console.info("Supabase endpoint:", endpoint.toString());

        // Request records
        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                apikey: config.supabasePublishableKey,
                Accept: "application/json"
            },
            signal: controller.signal
        });

        console.info("Supabase HTTP status:", response.status);

        if (!response.ok) {
            let details = "";

            try {
                const errorBody = await response.json();

                details =
                    errorBody.message ||
                    errorBody.msg ||
                    errorBody.error_description ||
                    errorBody.error ||
                    JSON.stringify(errorBody);
            } catch {
                details = response.statusText || "No additional details.";
            }

            throw new Error(
                "Supabase returned HTTP " +
                response.status +
                ". " +
                details
            );
        }

        // Parse response
        const students = await response.json();

        if (!Array.isArray(students)) {
            throw new Error("Unexpected response from Supabase.");
        }

        // Build table rows
        const fragment = document.createDocumentFragment();

        students.forEach(student => {
            const row = document.createElement("tr");

            fields.forEach(field => {
                const cell = document.createElement("td");
                let value = student[field];

                if (field === "created_at" && value) {
                    const date = new Date(value);

                    value = Number.isNaN(date.getTime())
                        ? String(value)
                        : date.toLocaleString("en-IN");
                }

                if (field === "issuedate" && value) {
                    const dateText = String(value);

                    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateText)) {
                        value = dateText.split("-").reverse().join("-");
                    }
                }

                if (
                    value === null ||
                    value === undefined ||
                    value === ""
                ) {
                    value = "—";
                }

                // Display data as text, not executable HTML
                cell.textContent = String(value);
                row.appendChild(cell);
            });

            fragment.appendChild(row);
        });

        // Update table
        if (students.length > 0) {
            records.replaceChildren(fragment);
        } else {
            showMessage("No records found.");
        }

        count.textContent = String(students.length);

        status.textContent = students.length > 0
            ? "Student records loaded successfully."
            : "Connected successfully. No student records are available.";

        console.info("Records loaded:", students.length);

    } catch (error) {
        showError(error);

    } finally {
        clearTimeout(timer);
        table.setAttribute("aria-busy", "false");
    }
}

// Retry button
if (retry) {
    retry.addEventListener("click", loadStudents);
}

// Load when the page is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadStudents);
} else {
    loadStudents();
}
