/*=========================================================*
 * MHAMBI LOGISTICS
 * CLIENT SHIPMENT HISTORY
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const companyNameElement =
        document.getElementById("companyName");

    const totalShipmentsElement =
        document.getElementById("totalShipments");

    const activeShipmentsElement =
        document.getElementById("activeShipments");

    const deliveredShipmentsElement =
        document.getElementById("deliveredShipments");

    const pendingShipmentsElement =
        document.getElementById("pendingShipments");

    const shipmentSearch =
        document.getElementById("shipmentSearch");

    const shipmentStatusFilter =
        document.getElementById("shipmentStatusFilter");

    const clearFiltersButton =
        document.getElementById("clearFilters");

    const emptyStateClearButton =
        document.getElementById("emptyStateClear");

    const shipmentHistoryBody =
        document.getElementById("shipmentHistoryBody");

    const shipmentEmptyState =
        document.getElementById("shipmentEmptyState");

    const shipmentRecordCount =
        document.getElementById("shipmentRecordCount");


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
                    DISPLAY COMPANY NAME
    =====================================================*/

    const companyName =
        loggedInCompany.companyName ||
        loggedInCompany.name ||
        "Client";


    if (companyNameElement) {

        companyNameElement.textContent =
            companyName;

    }


    /*=====================================================
                    SHIPMENT DATA
    =====================================================*/

    let allShipments = [];


    try {

        allShipments =
            JSON.parse(
                localStorage.getItem("shipments")
            ) || [];

    } catch (error) {

        console.error(
            "Could not read shipment records:",
            error
        );

        allShipments = [];

    }


    /*=====================================================
            DEMO SHIPMENTS FOR REGISTERED CLIENT
    =====================================================*/

    /*
        These records allow us to test the page while
        the quote-to-shipment workflow is still being
        connected.

        They are only added when the logged-in company
        does not already have shipment records.
    */


    const companyHasShipments =
        allShipments.some(function (shipment) {

            return (
                shipment.companyEmail &&
                loggedInCompany.companyEmail &&
                shipment.companyEmail.toLowerCase() ===
                loggedInCompany.companyEmail.toLowerCase()
            );

        });


    if (!companyHasShipments) {

        const companyEmail =
            (
                loggedInCompany.companyEmail ||
                loggedInCompany.email ||
                ""
            )
            .trim()
            .toLowerCase();


        const demoShipments = [

            {
                trackingNumber: "MHM-10021",

                companyName: companyName,

                companyEmail: companyEmail,

                origin: "Newcastle",

                destination: "Johannesburg",

                vehicle: "Truck 12",

                status: "in-transit",

                shipmentDate: "06 Aug 2026",

                eta: "Today"
            },


            {
                trackingNumber: "MHM-10018",

                companyName: companyName,

                companyEmail: companyEmail,

                origin: "Durban",

                destination: "Pretoria",

                vehicle: "Truck 08",

                status: "delivered",

                shipmentDate: "02 Aug 2026",

                eta: "Completed"
            },


            {
                trackingNumber: "MHM-10014",

                companyName: companyName,

                companyEmail: companyEmail,

                origin: "Richards Bay",

                destination: "Bloemfontein",

                vehicle: "Truck 17",

                status: "pending",

                shipmentDate: "05 Aug 2026",

                eta: "Tomorrow"
            }

        ];


        allShipments =
            allShipments.concat(
                demoShipments
            );


        localStorage.setItem(
            "shipments",
            JSON.stringify(allShipments)
        );

    }


    /*=====================================================
            GET ONLY THIS COMPANY'S SHIPMENTS
    =====================================================*/

    function getClientShipments() {

        const companyEmail =
            (
                loggedInCompany.companyEmail ||
                loggedInCompany.email ||
                ""
            )
            .trim()
            .toLowerCase();


        return allShipments.filter(
            function (shipment) {

                const shipmentEmail =
                    (
                        shipment.companyEmail ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                return (
                    shipmentEmail ===
                    companyEmail
                );

            }
        );

    }


    /*=====================================================
                    UPDATE SUMMARY
    =====================================================*/

    function updateSummary(shipments) {

        const total =
            shipments.length;


        const active =
            shipments.filter(
                function (shipment) {

                    return (
                        shipment.status ===
                        "in-transit"
                    );

                }
            ).length;


        const delivered =
            shipments.filter(
                function (shipment) {

                    return (
                        shipment.status ===
                        "delivered"
                    );

                }
            ).length;


        const pending =
            shipments.filter(
                function (shipment) {

                    return (
                        shipment.status ===
                        "pending"
                    );

                }
            ).length;


        if (totalShipmentsElement) {

            totalShipmentsElement.textContent =
                total;

        }


        if (activeShipmentsElement) {

            activeShipmentsElement.textContent =
                active;

        }


        if (deliveredShipmentsElement) {

            deliveredShipmentsElement.textContent =
                delivered;

        }


        if (pendingShipmentsElement) {

            pendingShipmentsElement.textContent =
                pending;

        }

    }


    /*=====================================================
                    STATUS LABEL
    =====================================================*/

    function getStatusLabel(status) {

        switch (status) {

            case "in-transit":

                return "In Transit";


            case "delivered":

                return "Delivered";


            case "pending":

                return "Pending";


            default:

                return "Unknown";

        }

    }


    /*=====================================================
                    STATUS CLASS
    =====================================================*/

    function getStatusClass(status) {

        switch (status) {

            case "in-transit":

                return "in-transit";


            case "delivered":

                return "delivered";


            case "pending":

                return "pending";


            default:

                return "";

        }

    }


    /*=====================================================
                DISPLAY SHIPMENTS
    =====================================================*/

    function displayShipments(shipments) {

        if (!shipmentHistoryBody) {

            return;

        }


        shipmentHistoryBody.innerHTML =
            "";


        if (shipmentRecordCount) {

            shipmentRecordCount.textContent =
                shipments.length +
                (
                    shipments.length === 1
                        ? " Record"
                        : " Records"
                );

        }


        /*=================================================
                    EMPTY STATE
        =================================================*/

        if (shipments.length === 0) {

            if (shipmentEmptyState) {

                shipmentEmptyState.style.display =
                    "block";

            }


            return;

        }


        if (shipmentEmptyState) {

            shipmentEmptyState.style.display =
                "none";

        }


        /*=================================================
                    CREATE TABLE ROWS
        =================================================*/

        shipments.forEach(
            function (shipment) {

                const row =
                    document.createElement("tr");


                row.innerHTML = `

                    <td>

                        <span class="history-tracking-number">

                            ${escapeHTML(
                                shipment.trackingNumber ||
                                "N/A"
                            )}

                        </span>

                    </td>


                    <td>

                        ${escapeHTML(
                            shipment.origin ||
                            "N/A"
                        )}

                    </td>


                    <td>

                        ${escapeHTML(
                            shipment.destination ||
                            "N/A"
                        )}

                    </td>


                    <td>

                        ${escapeHTML(
                            shipment.vehicle ||
                            "N/A"
                        )}

                    </td>


                    <td>

                        <span class="history-status ${getStatusClass(
                            shipment.status
                        )}">

                            ${getStatusLabel(
                                shipment.status
                            )}

                        </span>

                    </td>


                    <td>

                        ${escapeHTML(
                            shipment.shipmentDate ||
                            "N/A"
                        )}

                    </td>


                    <td>

                        <a
                            href="client-track.html?trackingNumber=${encodeURIComponent(
                                shipment.trackingNumber || ""
                            )}"
                            class="history-track-btn">

                            <i class="fas fa-location-dot"></i>

                            Track

                        </a>

                    </td>

                `;


                shipmentHistoryBody.appendChild(
                    row
                );

            }
        );

    }


    /*=====================================================
                    SEARCH & FILTER
    =====================================================*/

    function filterShipments() {

        const clientShipments =
            getClientShipments();


        const searchTerm =
            shipmentSearch
                ? shipmentSearch.value
                    .trim()
                    .toLowerCase()
                : "";


        const selectedStatus =
            shipmentStatusFilter
                ? shipmentStatusFilter.value
                : "all";


        const filteredShipments =
            clientShipments.filter(
                function (shipment) {

                    const searchableText = [

                        shipment.trackingNumber,

                        shipment.origin,

                        shipment.destination,

                        shipment.vehicle,

                        shipment.status

                    ]
                    .join(" ")
                    .toLowerCase();


                    const matchesSearch =
                        !searchTerm ||
                        searchableText.includes(
                            searchTerm
                        );


                    const matchesStatus =
                        selectedStatus === "all" ||
                        shipment.status ===
                        selectedStatus;


                    return (
                        matchesSearch &&
                        matchesStatus
                    );

                }
            );


        displayShipments(
            filteredShipments
        );

    }


    /*=====================================================
                    CLEAR FILTERS
    =====================================================*/

    function clearFilters() {

        if (shipmentSearch) {

            shipmentSearch.value =
                "";

        }


        if (shipmentStatusFilter) {

            shipmentStatusFilter.value =
                "all";

        }


        filterShipments();

    }


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

    if (shipmentSearch) {

        shipmentSearch.addEventListener(
            "input",
            filterShipments
        );

    }


    if (shipmentStatusFilter) {

        shipmentStatusFilter.addEventListener(
            "change",
            filterShipments
        );

    }


    if (clearFiltersButton) {

        clearFiltersButton.addEventListener(
            "click",
            clearFilters
        );

    }


    if (emptyStateClearButton) {

        emptyStateClearButton.addEventListener(
            "click",
            clearFilters
        );

    }


    /*=====================================================
                    INITIALISE PAGE
    =====================================================*/

    const clientShipments =
        getClientShipments();


    updateSummary(
        clientShipments
    );


    displayShipments(
        clientShipments
    );

});