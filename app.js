
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

function showMessage(message) {
    if (!records) return;

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.className = "empty";
    cell.textContent = message;

    row.appendChild(cell);
    records.replaceChildren(row);
}

function showError(error) {
    console.error("Yoga Student Records Error:", error);

    if (status) {
        status.textContent = error.name === "AbortError"
            ? "Request timed out. Please retry."
            : error.message || "Unable to load student records.";
    }

    showMessage("Student records could not be loaded.");

    if (retry) retry.hidden = false;
}

// Convert the issue date to DD/MM/YYYY
function formatDate(value) {
    if (!value) return "";

    const text = String(value);

    // Handles YYYY-MM-DD without timezone conversion
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) return text;

    return [
        String(date.getDate()).padStart(2, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        date.getFullYear()
    ].join("/");
}

// Load the certificate image and convert it to a PDF-compatible image
function loadCertificateImage() {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;

                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);

                resolve({
                    data: canvas.toDataURL("image/jpeg", 0.95),
                    width: image.naturalWidth,
                    height: image.naturalHeight
                });
            } catch (error) {
                reject(error);
            }
        };

        image.onerror = () => reject(
            new Error("Certificate template not found. Check certificate-template.jpeg.")
        );

        image.src = "./certificate-template.jpeg";
    });
}

// Download one certificate for the selected student
async function downloadCertificate(student, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing...";

    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error("PDF library failed to load. Check your internet connection.");
        }

        const template = await loadCertificateImage();
        const { jsPDF } = window.jspdf;

        // Landscape PDF page matching the certificate's aspect ratio
        const pageWidth = 297;
        const pageHeight = pageWidth * template.height / template.width;

        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: [pageWidth, pageHeight],
            compress: true
        });

        pdf.addImage(
            template.data,
            "JPEG",
            0,
            0,
            pageWidth,
            pageHeight
        );

        // Convert original image pixel coordinates to PDF millimetres
        const X = px => px * pageWidth / template.width;
        const Y = px => px * pageHeight / template.height;

        // Certificate text styling
        pdf.setTextColor(18, 31, 75);
        pdf.setFont("helvetica", "bold");

        // Student name: centered on the existing student-name line
        pdf.setFontSize(15);
        pdf.text(
            String(student.studentname || ""),
            X(920),
            Y(527),
            { align: "center", maxWidth: X(700) }
        );

        // School name: cover the preprinted school line/text so the
        // actual student's school name can be printed in its place.
        pdf.setFillColor(255, 254, 246);
        pdf.rect(X(550), Y(539), X(740), Y(43), "F");

        pdf.setDrawColor(30, 35, 55);
        pdf.setLineWidth(0.25);
        pdf.line(X(555), Y(575), X(1280), Y(575));

        pdf.setFontSize(13);
        pdf.text(
            String(student.schoolname || ""),
            X(915),
            Y(568),
            { align: "center", maxWidth: X(700) }
        );

        // Issue date
        pdf.setFontSize(13);
        pdf.text(
            formatDate(student.issuedate),
            X(490),
            Y(659),
            { align: "center" }
        );

        // Organizer name above the Organizer / Principal label
        pdf.setFontSize(12);
        pdf.text(
            String(student.organizer || ""),
            X(1165),
            Y(688),
            { align: "center", maxWidth: X(300) }
        );

        // Create a safe filename
        const safeName = String(student.studentname || "Student")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .trim()
            .replace(/\s+/g, "_");

        pdf.save(`Certificate_${safeName || "Student"}.pdf`);

    } catch (error) {
        console.error("Certificate download error:", error);
        alert(error.message || "Unable to generate the certificate.");
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

// Load student records from Supabase
async function loadStudents() {
    if (!records || !count || !status || !retry || !table) {
        console.error("Check the required HTML element IDs.");
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
        const config = window.YOGA_CONFIG;

        if (!config || !config.supabaseUrl ||
            !config.supabasePublishableKey) {
            throw new Error("Check your Supabase settings in config.js.");
        }

        const supabaseUrl = new URL(config.supabaseUrl);

        if (
            supabaseUrl.protocol !== "https:" ||
            !supabaseUrl.hostname.endsWith(".supabase.co")
        ) {
            throw new Error("Invalid Supabase project URL.");
        }

        const endpoint = new URL(
            "/rest/v1/student_yoga",
            supabaseUrl.origin
        );

        endpoint.searchParams.set("select", fields.join(","));
        endpoint.searchParams.set("order", "created_at.desc");

        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                apikey: config.supabasePublishableKey,
                Accept: "application/json"
            },
            signal: controller.signal
        });

        if (!response.ok) {
            let details = response.statusText;

            try {
                const body = await response.json();
                details = body.message || body.msg ||
                    body.error_description || body.error || details;
            } catch {
                // Keep the HTTP status text
            }

            throw new Error(`Supabase HTTP ${response.status}: ${details}`);
        }

        const students = await response.json();

        if (!Array.isArray(students)) {
            throw new Error("Unexpected response from Supabase.");
        }

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
                    value = formatDate(value);
                }

                cell.textContent =
                    value === null || value === undefined || value === ""
                        ? "—"
                        : String(value);

                row.appendChild(cell);
            });

            // Add a separate certificate-download button to this row
            const actionCell = document.createElement("td");
            const downloadButton = document.createElement("button");

            downloadButton.type = "button";
            downloadButton.textContent = "Download Certificate";
            downloadButton.className = "download-certificate";

            downloadButton.addEventListener("click", () => {
                downloadCertificate(student, downloadButton);
            });

            actionCell.appendChild(downloadButton);
            row.appendChild(actionCell);
            fragment.appendChild(row);
        });

        if (students.length) {
            records.replaceChildren(fragment);
        } else {
            showMessage("No records found.");
        }

        count.textContent = String(students.length);
        status.textContent = students.length
            ? "Student records loaded successfully."
            : "Connected successfully. No student records are available.";

    } catch (error) {
        showError(error);
    } finally {
        clearTimeout(timer);
        table.setAttribute("aria-busy", "false");
    }
}

if (retry) {
    retry.addEventListener("click", loadStudents);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadStudents);
} else {
    loadStudents();
}
