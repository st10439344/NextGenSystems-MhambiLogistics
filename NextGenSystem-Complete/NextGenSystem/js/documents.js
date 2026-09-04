/*=========================================================*
 * MHAMBI LOGISTICS
 * CLIENT DOCUMENT CENTRE
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const companyNameElement =
        document.getElementById("companyName");

    const totalDocumentsElement =
        document.getElementById("totalDocuments");

    const totalQuotesElement =
        document.getElementById("totalQuotes");

    const totalInvoicesElement =
        document.getElementById("totalInvoices");

    const totalDeliveryDocumentsElement =
        document.getElementById("totalDeliveryDocuments");

    const documentSearch =
        document.getElementById("documentSearch");

    const documentCategory =
        document.getElementById("documentCategory");

    const clearDocumentFilters =
        document.getElementById("clearDocumentFilters");

    const emptyDocumentClear =
        document.getElementById("emptyDocumentClear");

    const documentTableBody =
        document.getElementById("documentTableBody");

    const documentEmptyState =
        document.getElementById("documentEmptyState");

    const documentRecordCount =
        document.getElementById("documentRecordCount");


    /*=====================================================
                CHECK LOGIN STATUS
    =====================================================*/

    const isLoggedIn =
        localStorage.getItem("isLoggedIn");

    const loggedInCompanyData =
        localStorage.getItem("loggedInCompany");


    if (
        isLoggedIn !== "true" ||
        !loggedInCompanyData
    ) {

        window.location.href =
            "login.html";

        return;

    }


    /*=====================================================
                GET LOGGED-IN COMPANY
    =====================================================*/

    let loggedInCompany = null;


    try {

        loggedInCompany =
            JSON.parse(loggedInCompanyData);

    } catch (error) {

        console.error(
            "Could not read logged-in company:",
            error
        );

        localStorage.removeItem("loggedInCompany");

        localStorage.removeItem("isLoggedIn");

        window.location.href =
            "login.html";

        return;

    }


    /*=====================================================
                    COMPANY DETAILS
    =====================================================*/

    const companyName =
        loggedInCompany.companyName ||
        loggedInCompany.name ||
        "Client";


    const companyEmail =
        (
            loggedInCompany.companyEmail ||
            loggedInCompany.email ||
            ""
        )
        .trim()
        .toLowerCase();


    if (companyNameElement) {

        companyNameElement.textContent =
            companyName;

    }


    /*=====================================================
                    DOCUMENT STORAGE
    =====================================================*/

    let allDocuments = [];


    try {

        allDocuments =
            JSON.parse(
                localStorage.getItem("documents")
            ) || [];

    } catch (error) {

        console.error(
            "Could not read documents:",
            error
        );

        allDocuments = [];

    }


    /*=====================================================
                CHECK CLIENT DOCUMENTS
    =====================================================*/

    const clientHasDocuments =
        allDocuments.some(
            function (documentRecord) {

                const documentEmail =
                    (
                        documentRecord.companyEmail ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                return (
                    documentEmail ===
                    companyEmail
                );

            }
        );


    /*=====================================================
                    DEMO DOCUMENTS
    =====================================================*/

    /*
        These are temporary testing records.

        They are created only when the logged-in company
        does not yet have any documents.

        Later these records can be replaced by documents
        generated from the quotation, shipment and invoice
        systems.
    */

    if (!clientHasDocuments) {

        const demoDocuments = [

            {
                documentId: "QT-00125",

                documentName:
                    "Transport Quotation",

                documentNumber:
                    "QT-00125",

                category:
                    "quote",

                companyName:
                    companyName,

                companyEmail:
                    companyEmail,

                shipmentNumber:
                    "MHM-10021",

                date:
                    "06 Aug 2026",

                status:
                    "Approved"
            },


            {
                documentId: "QT-00124",

                documentName:
                    "Warehousing Quotation",

                documentNumber:
                    "QT-00124",

                category:
                    "quote",

                companyName:
                    companyName,

                companyEmail:
                    companyEmail,

                shipmentNumber:
                    "MHM-10014",

                date:
                    "05 Aug 2026",

                status:
                    "Pending"
            },


            {
                documentId:
                    "INV-2026-014",

                documentName:
                    "Logistics Service Invoice",

                documentNumber:
                    "INV-2026-014",

                category:
                    "invoice",

                companyName:
                    companyName,

                companyEmail:
                    companyEmail,

                shipmentNumber:
                    "MHM-10018",

                date:
                    "04 Aug 2026",

                status:
                    "Available"
            },


            {
                documentId:
                    "POD-10018",

                documentName:
                    "Proof of Delivery",

                documentNumber:
                    "POD-10018",

                category:
                    "delivery",

                companyName:
                    companyName,

                companyEmail:
                    companyEmail,

                shipmentNumber:
                    "MHM-10018",

                date:
                    "02 Aug 2026",

                status:
                    "Completed"
            },


            {
                documentId:
                    "SHP-10021",

                documentName:
                    "Shipment Confirmation",

                documentNumber:
                    "SHP-10021",

                category:
                    "shipment",

                companyName:
                    companyName,

                companyEmail:
                    companyEmail,

                shipmentNumber:
                    "MHM-10021",

                date:
                    "06 Aug 2026",

                status:
                    "Active"
            }

        ];


        allDocuments =
            allDocuments.concat(
                demoDocuments
            );


        localStorage.setItem(
            "documents",
            JSON.stringify(allDocuments)
        );

    }


    /*=====================================================
                GET CLIENT DOCUMENTS
    =====================================================*/

    function getClientDocuments() {

        return allDocuments.filter(
            function (documentRecord) {

                const documentEmail =
                    (
                        documentRecord.companyEmail ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                return (
                    documentEmail ===
                    companyEmail
                );

            }
        );

    }


    /*=====================================================
                CATEGORY LABEL
    =====================================================*/

    function getCategoryLabel(category) {

        switch (category) {

            case "quote":

                return "Quotation";


            case "invoice":

                return "Invoice";


            case "delivery":

                return "Proof of Delivery";


            case "shipment":

                return "Shipment";


            case "other":

                return "Other";


            default:

                return "Document";

        }

    }


    /*=====================================================
                CATEGORY CLASS
    =====================================================*/

    function getCategoryClass(category) {

        switch (category) {

            case "quote":

                return "quote";


            case "invoice":

                return "invoice";


            case "delivery":

                return "delivery";


            case "shipment":

                return "shipment";


            default:

                return "other";

        }

    }


    /*=====================================================
                STATUS CLASS
    =====================================================*/

    function getStatusClass(status) {

        const normalisedStatus =
            String(status || "")
                .toLowerCase();


        if (
            normalisedStatus.includes("approved") ||
            normalisedStatus.includes("completed") ||
            normalisedStatus.includes("available")
        ) {

            return "available";

        }


        if (
            normalisedStatus.includes("pending")
        ) {

            return "pending";

        }


        if (
            normalisedStatus.includes("active")
        ) {

            return "active";

        }


        return "default";

    }


    /*=====================================================
                    DOCUMENT ICON
    =====================================================*/

    function getDocumentIcon(category) {

        switch (category) {

            case "quote":

                return "fa-file-signature";


            case "invoice":

                return "fa-file-invoice-dollar";


            case "delivery":

                return "fa-file-circle-check";


            case "shipment":

                return "fa-truck";


            default:

                return "fa-file";

        }

    }


    /*=====================================================
                UPDATE SUMMARY CARDS
    =====================================================*/

    function updateSummary(documents) {

        const total =
            documents.length;


        const quotes =
            documents.filter(
                function (documentRecord) {

                    return (
                        documentRecord.category ===
                        "quote"
                    );

                }
            ).length;


        const invoices =
            documents.filter(
                function (documentRecord) {

                    return (
                        documentRecord.category ===
                        "invoice"
                    );

                }
            ).length;


        const deliveryDocuments =
            documents.filter(
                function (documentRecord) {

                    return (
                        documentRecord.category ===
                        "delivery"
                    );

                }
            ).length;


        if (totalDocumentsElement) {

            totalDocumentsElement.textContent =
                total;

        }


        if (totalQuotesElement) {

            totalQuotesElement.textContent =
                quotes;

        }


        if (totalInvoicesElement) {

            totalInvoicesElement.textContent =
                invoices;

        }


        if (
            totalDeliveryDocumentsElement
        ) {

            totalDeliveryDocumentsElement.textContent =
                deliveryDocuments;

        }

    }


    /*=====================================================
                    DISPLAY DOCUMENTS
    =====================================================*/

    function displayDocuments(documents) {

        if (!documentTableBody) {

            console.error(
                "Document table body could not be found."
            );

            return;

        }


        documentTableBody.innerHTML =
            "";


        if (documentRecordCount) {

            documentRecordCount.textContent =
                documents.length +
                (
                    documents.length === 1
                        ? " Document"
                        : " Documents"
                );

        }


        /*=================================================
                    EMPTY STATE
        ==================================================*/

        if (documents.length === 0) {

            if (documentEmptyState) {

                documentEmptyState.style.display =
                    "block";

            }


            return;

        }


        if (documentEmptyState) {

            documentEmptyState.style.display =
                "none";

        }


        /*=================================================
                    CREATE DOCUMENT ROWS
        ==================================================*/

        documents.forEach(
            function (documentRecord) {

                const row =
                    document.createElement("tr");


                row.innerHTML = `

                    <td>

                        <div class="document-name-cell">

                            <div class="document-file-icon ${getCategoryClass(
                                documentRecord.category
                            )}">

                                <i class="fas ${getDocumentIcon(
                                    documentRecord.category
                                )}"></i>

                            </div>


                            <div>

                                <strong>

                                    ${escapeHTML(
                                        documentRecord.documentName ||
                                        "Unnamed Document"
                                    )}

                                </strong>


                                <small>

                                    ${escapeHTML(
                                        getCategoryLabel(
                                            documentRecord.category
                                        )
                                    )}

                                </small>

                            </div>

                        </div>

                    </td>


                    <td>

                        <span class="document-number">

                            ${escapeHTML(
                                documentRecord.documentNumber ||
                                documentRecord.documentId ||
                                "N/A"
                            )}

                        </span>

                    </td>


                    <td>

                        <span class="document-category-badge ${getCategoryClass(
                            documentRecord.category
                        )}">

                            ${getCategoryLabel(
                                documentRecord.category
                            )}

                        </span>

                    </td>


                    <td>

                        ${
                            documentRecord.shipmentNumber

                            ?

                            `<a
                                href="client-track.html?trackingNumber=${encodeURIComponent(
                                    documentRecord.shipmentNumber
                                )}"
                                class="document-shipment-link">

                                ${escapeHTML(
                                    documentRecord.shipmentNumber
                                )}

                            </a>`

                            :

                            "—"
                        }

                    </td>


                    <td>

                        ${escapeHTML(
                            documentRecord.date ||
                            "N/A"
                        )}

                    </td>


                    <td>

                        <span class="document-status ${getStatusClass(
                            documentRecord.status
                        )}">

                            ${escapeHTML(
                                documentRecord.status ||
                                "Available"
                            )}

                        </span>

                    </td>


                    <td>

                        <button
                            type="button"
                            class="document-view-btn"
                            data-document-id="${escapeHTML(
                                documentRecord.documentId ||
                                documentRecord.documentNumber ||
                                ""
                            )}">

                            <i class="fas fa-eye"></i>

                            View

                        </button>

                    </td>

                `;


                documentTableBody.appendChild(
                    row
                );

            }
        );


        attachDocumentButtons();

    }


    /*=====================================================
                SEARCH AND FILTER
    =====================================================*/

    function filterDocuments() {

        const clientDocuments =
            getClientDocuments();


        const searchTerm =
            documentSearch
                ? documentSearch.value
                    .trim()
                    .toLowerCase()
                : "";


        const selectedCategory =
            documentCategory
                ? documentCategory.value
                : "all";


        const filteredDocuments =
            clientDocuments.filter(
                function (documentRecord) {

                    const searchableText = [

                        documentRecord.documentName,

                        documentRecord.documentNumber,

                        documentRecord.shipmentNumber,

                        documentRecord.category,

                        documentRecord.status

                    ]
                    .join(" ")
                    .toLowerCase();


                    const matchesSearch =
                        !searchTerm ||
                        searchableText.includes(
                            searchTerm
                        );


                    const matchesCategory =
                        selectedCategory === "all" ||
                        documentRecord.category ===
                        selectedCategory;


                    return (
                        matchesSearch &&
                        matchesCategory
                    );

                }
            );


        displayDocuments(
            filteredDocuments
        );

    }


    /*=====================================================
                    CLEAR FILTERS
    =====================================================*/

    function clearFilters() {

        if (documentSearch) {

            documentSearch.value =
                "";

        }


        if (documentCategory) {

            documentCategory.value =
                "all";

        }


        filterDocuments();

    }


    /*=====================================================
                ATTACH VIEW BUTTONS
    =====================================================*/

    function attachDocumentButtons() {

        const viewButtons =
            document.querySelectorAll(
                ".document-view-btn"
            );


        viewButtons.forEach(
            function (button) {

                button.addEventListener(
                    "click",
                    function () {

                        const documentId =
                            button.dataset.documentId;


                        openDocument(
                            documentId
                        );

                    }
                );

            }
        );

    }


    /*=====================================================
                    OPEN DOCUMENT
    =====================================================*/

    function openDocument(documentId) {

        const clientDocuments =
            getClientDocuments();


        const selectedDocument =
            clientDocuments.find(
                function (documentRecord) {

                    return (
                        String(
                            documentRecord.documentId ||
                            documentRecord.documentNumber
                        ) ===
                        String(documentId)
                    );

                }
            );


        if (!selectedDocument) {

            alert(
                "The requested document could not be found."
            );

            return;

        }


        showDocumentPreview(
            selectedDocument
        );

    }


    /*=====================================================
                DOCUMENT PREVIEW MODAL
    =====================================================*/

    function showDocumentPreview(
        documentRecord
    ) {

        const existingModal =
            document.getElementById(
                "documentPreviewModal"
            );


        if (existingModal) {

            existingModal.remove();

        }


        const modal =
            document.createElement("div");


        modal.id =
            "documentPreviewModal";


        modal.className =
            "document-preview-modal";


        modal.innerHTML = `

            <div class="document-preview-overlay"></div>


            <div class="document-preview-card">


                <button
                    type="button"
                    class="document-preview-close"
                    id="closeDocumentPreview"
                    aria-label="Close document preview">

                    <i class="fas fa-xmark"></i>

                </button>


                <div class="document-preview-header">


                    <div class="document-preview-icon">

                        <i class="fas ${getDocumentIcon(
                            documentRecord.category
                        )}"></i>

                    </div>


                    <div>

                        <span>

                            ${getCategoryLabel(
                                documentRecord.category
                            )}

                        </span>


                        <h2>

                            ${escapeHTML(
                                documentRecord.documentName ||
                                "Document"
                            )}

                        </h2>

                    </div>

                </div>


                <div class="document-preview-details">


                    <div>

                        <span>

                            Document Number

                        </span>

                        <strong>

                            ${escapeHTML(
                                documentRecord.documentNumber ||
                                documentRecord.documentId ||
                                "N/A"
                            )}

                        </strong>

                    </div>


                    <div>

                        <span>

                            Company

                        </span>

                        <strong>

                            ${escapeHTML(
                                companyName
                            )}

                        </strong>

                    </div>


                    <div>

                        <span>

                            Related Shipment

                        </span>

                        <strong>

                            ${escapeHTML(
                                documentRecord.shipmentNumber ||
                                "Not applicable"
                            )}

                        </strong>

                    </div>


                    <div>

                        <span>

                            Date

                        </span>

                        <strong>

                            ${escapeHTML(
                                documentRecord.date ||
                                "N/A"
                            )}

                        </strong>

                    </div>


                    <div>

                        <span>

                            Status

                        </span>

                        <strong>

                            ${escapeHTML(
                                documentRecord.status ||
                                "Available"
                            )}

                        </strong>

                    </div>

                </div>


                <div class="document-preview-message">

                    <i class="fas fa-circle-info"></i>


                    <p>

                        This document is currently stored
                        as a digital client record. Full PDF
                        generation and download functionality
                        can be connected when the backend
                        document service is implemented.

                    </p>

                </div>


                <div class="document-preview-actions">


                    ${
                        documentRecord.shipmentNumber

                        ?

                        `<a
                            href="client-track.html?trackingNumber=${encodeURIComponent(
                                documentRecord.shipmentNumber
                            )}"
                            class="track-btn">

                            <i class="fas fa-location-dot"></i>

                            Track Shipment

                        </a>`

                        :

                        ""
                    }


                    <button
                        type="button"
                        class="quote-btn"
                        id="closeDocumentPreviewButton">

                        Close

                    </button>

                </div>


            </div>

        `;


        document.body.appendChild(
            modal
        );


        const closeButton =
            document.getElementById(
                "closeDocumentPreview"
            );


        const closeBottomButton =
            document.getElementById(
                "closeDocumentPreviewButton"
            );


        const overlay =
            modal.querySelector(
                ".document-preview-overlay"
            );


        function closeModal() {

            modal.remove();

        }


        if (closeButton) {

            closeButton.addEventListener(
                "click",
                closeModal
            );

        }


        if (closeBottomButton) {

            closeBottomButton.addEventListener(
                "click",
                closeModal
            );

        }


        if (overlay) {

            overlay.addEventListener(
                "click",
                closeModal
            );

        }


        /* Close with ESC key */

        document.addEventListener(
            "keydown",
            function escapePreview(event) {

                if (event.key === "Escape") {

                    closeModal();

                    document.removeEventListener(
                        "keydown",
                        escapePreview
                    );

                }

            }
        );

    }


    /*=====================================================
                QUICK CATEGORY BUTTONS
    =====================================================*/

    const categoryButtons =
        document.querySelectorAll(
            ".document-category-btn"
        );


    categoryButtons.forEach(
        function (button) {

            button.addEventListener(
                "click",
                function () {

                    const category =
                        button.dataset.category;


                    if (documentCategory) {

                        documentCategory.value =
                            category;

                    }


                    filterDocuments();


                    const documentSection =
                        document.querySelector(
                            ".documents-card"
                        );


                    if (documentSection) {

                        documentSection.scrollIntoView({

                            behavior:
                                "smooth",

                            block:
                                "start"

                        });

                    }

                }
            );

        }
    );


    /*=====================================================
                    ESCAPE HTML
    =====================================================*/

    function escapeHTML(value) {

        const div =
            document.createElement("div");


        div.textContent =
            value ?? "";


        return div.innerHTML;

    }


    /*=====================================================
                    EVENT LISTENERS
    =====================================================*/

    if (documentSearch) {

        documentSearch.addEventListener(
            "input",
            filterDocuments
        );

    }


    if (documentCategory) {

        documentCategory.addEventListener(
            "change",
            filterDocuments
        );

    }


    if (clearDocumentFilters) {

        clearDocumentFilters.addEventListener(
            "click",
            clearFilters
        );

    }


    if (emptyDocumentClear) {

        emptyDocumentClear.addEventListener(
            "click",
            clearFilters
        );

    }


    /*=====================================================
                    INITIALISE PAGE
    =====================================================*/

    const clientDocuments =
        getClientDocuments();


    updateSummary(
        clientDocuments
    );


    displayDocuments(
        clientDocuments
    );

});