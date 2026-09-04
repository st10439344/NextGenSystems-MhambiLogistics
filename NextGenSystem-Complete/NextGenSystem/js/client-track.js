/*=========================================================*
 * MHAMBI LOGISTICS
 * CLIENT SHIPMENT TRACKING
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const trackingForm =
        document.getElementById("trackingForm");

    const shipmentIdInput =
        document.getElementById("shipmentId");

    const trackButton =
        document.getElementById("trackButton");

    const trackingMessage =
        document.getElementById("trackingMessage");

    const companyName =
        document.getElementById("companyName");

    const shipmentResultSection =
        document.querySelector(".shipment-result-section");


    /*=====================================================
                CHECK TRACKING FORM
    =====================================================*/

    if (!trackingForm) {

        console.error(
            "Tracking form could not be found."
        );

        return;

    }


    /*=====================================================
                HIDE RESULT INITIALLY
    =====================================================*/

    if (shipmentResultSection) {

        shipmentResultSection.style.display =
            "none";

    }


    /*=====================================================
                GET LOGGED-IN CLIENT
    =====================================================*/

    let loggedInCompany = null;

    try {

        const storedCompany =
            localStorage.getItem(
                "loggedInCompany"
            );

        if (storedCompany) {

            loggedInCompany =
                JSON.parse(storedCompany);

        }

    } catch (error) {

        console.error(
            "Could not read logged-in client:",
            error
        );

    }


    /*=====================================================
                DISPLAY COMPANY NAME
    =====================================================*/

    if (
        loggedInCompany &&
        companyName
    ) {

        companyName.textContent =
            loggedInCompany.companyName ||
            "Client";

    }


    /*=====================================================
                CHECK LOGIN STATUS
    =====================================================*/

    const isLoggedIn =
        localStorage.getItem(
            "isLoggedIn"
        );


    if (
        isLoggedIn !== "true" ||
        !loggedInCompany
    ) {

        showTrackingMessage(
            "Your client session could not be verified. Please sign in again.",
            "error"
        );

        trackingForm.style.display =
            "none";

        return;

    }


    /*=====================================================
                SHIPMENT DATABASE
    =====================================================*/

    /*
        These are sample shipments for testing.

        Later, we can replace this section with
        shipments created by the actual logistics system.
    */

    const shipments = [

        {
            shipmentId: "MHM-10021",

            companyName:
                "ABC Construction (Pty) Ltd",

            origin:
                "Newcastle",

            destination:
                "Johannesburg",

            status:
                "In Transit",

            statusMessage:
                "Your shipment is currently on its way to the delivery destination.",

            vehicle:
                "Truck 12",

            driver:
                "Assigned Driver",

            eta:
                "Today",

            progress:
                65,

            bookedDate:
                "Shipment successfully registered.",

            collectionStatus:
                "Cargo has been collected from the origin location.",

            transitStatus:
                "Your shipment is currently travelling to its destination.",

            deliveryStatus:
                "Awaiting final delivery.",

            cargoType:
                "General Cargo",

            cargoWeight:
                "Not specified",

            cargoItems:
                "Not specified",

            serviceType:
                "Road Freight",

            priority:
                "Standard",

            currentLocation:
                "In Transit"

        },

        {
            shipmentId: "MHM-10018",

            companyName:
                "ABC Construction (Pty) Ltd",

            origin:
                "Durban",

            destination:
                "Pretoria",

            status:
                "Delivered",

            statusMessage:
                "Your shipment has successfully reached its destination.",

            vehicle:
                "Truck 08",

            driver:
                "Assigned Driver",

            eta:
                "Delivered",

            progress:
                100,

            bookedDate:
                "Shipment successfully registered.",

            collectionStatus:
                "Cargo was collected successfully.",

            transitStatus:
                "Shipment travelled to the destination.",

            deliveryStatus:
                "Shipment successfully delivered.",

            cargoType:
                "General Cargo",

            cargoWeight:
                "Not specified",

            cargoItems:
                "Not specified",

            serviceType:
                "Road Freight",

            priority:
                "Standard",

            currentLocation:
                "Pretoria"

        },

        {
            shipmentId: "MHM-10014",

            companyName:
                "ABC Construction (Pty) Ltd",

            origin:
                "Richards Bay",

            destination:
                "Bloemfontein",

            status:
                "Loading",

            statusMessage:
                "Your shipment is currently being prepared for transportation.",

            vehicle:
                "Truck 17",

            driver:
                "Assigned Driver",

            eta:
                "Tomorrow",

            progress:
                30,

            bookedDate:
                "Shipment successfully registered.",

            collectionStatus:
                "Cargo is being prepared for collection.",

            transitStatus:
                "Shipment has not yet departed.",

            deliveryStatus:
                "Awaiting collection and transportation.",

            cargoType:
                "General Cargo",

            cargoWeight:
                "Not specified",

            cargoItems:
                "Not specified",

            serviceType:
                "Road Freight",

            priority:
                "Standard",

            currentLocation:
                "Richards Bay"

        }

    ];


    /*=====================================================
                TRACKING FORM SUBMISSION
    =====================================================*/

    trackingForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const shipmentId =
                shipmentIdInput.value
                    .trim()
                    .toUpperCase();


            /*=============================================
                    VALIDATE SHIPMENT ID
            =============================================*/

            if (!shipmentId) {

                showTrackingMessage(
                    "Please enter your shipment reference number.",
                    "error"
                );

                shipmentIdInput.focus();

                return;

            }


            /*=============================================
                    START LOADING
            =============================================*/

            setTrackingLoadingState();


            /*=============================================
                    FIND SHIPMENT
            =============================================*/

            setTimeout(
                function () {

                    const shipment =
                        findShipment(
                            shipmentId
                        );


                    /*=====================================
                            SHIPMENT NOT FOUND
                    =====================================*/

                    if (!shipment) {

                        resetTrackingButton();

                        hideShipmentResult();

                        showTrackingMessage(
                            "We could not find a shipment matching that reference number.",
                            "error"
                        );

                        return;

                    }


                    /*=====================================
                        CHECK COMPANY OWNERSHIP
                    =====================================*/

                    const registeredCompanyName =
                        (
                            loggedInCompany.companyName ||
                            ""
                        )
                        .trim()
                        .toLowerCase();


                    const shipmentCompanyName =
                        (
                            shipment.companyName ||
                            ""
                        )
                        .trim()
                        .toLowerCase();


                    /*
                        Prevent one client from viewing
                        another client's shipment.
                    */

                    if (
                        registeredCompanyName !==
                        shipmentCompanyName
                    ) {

                        resetTrackingButton();

                        hideShipmentResult();

                        showTrackingMessage(
                            "This shipment is not associated with your registered company account.",
                            "error"
                        );

                        return;

                    }


                    /*=====================================
                        DISPLAY SHIPMENT
                    =====================================*/

                    displayShipment(
                        shipment
                    );


                    resetTrackingButton();

                    showTrackingMessage(
                        "Shipment information successfully retrieved.",
                        "success"
                    );


                },
                700
            );

        }
    );



    /*=====================================================
                    FIND SHIPMENT
    =====================================================*/

    function findShipment(
        shipmentId
    ) {

        return shipments.find(
            function (shipment) {

                return (
                    shipment.shipmentId
                        .toUpperCase() ===
                    shipmentId
                );

            }
        );

    }



    /*=====================================================
                    DISPLAY SHIPMENT
    =====================================================*/

    function displayShipment(
        shipment
    ) {

        if (!shipmentResultSection) {

            return;

        }


        shipmentResultSection.style.display =
            "block";


        /*=============================================
                    BASIC INFORMATION
        =============================================*/

        setText(
            "resultShipmentId",
            shipment.shipmentId
        );


        setText(
            "shipmentStatus",
            shipment.status
        );


        setText(
            "shipmentStatusMessage",
            shipment.statusMessage
        );


        setText(
            "shipmentEta",
            shipment.eta
        );


        setText(
            "shipmentOrigin",
            shipment.origin
        );


        setText(
            "shipmentDestination",
            shipment.destination
        );


        setText(
            "shipmentVehicle",
            shipment.vehicle
        );


        setText(
            "shipmentDriver",
            shipment.driver
        );


        /*=============================================
                    PROGRESS
        =============================================*/

        const progress =
            Number(
                shipment.progress
            ) || 0;


        setText(
            "progressPercentage",
            progress + "%"
        );


        const progressBar =
            document.getElementById(
                "progressBar"
            );


        if (progressBar) {

            progressBar.style.width =
                progress + "%";

        }


        /*=============================================
                    TIMELINE
        =============================================*/

        setText(
            "bookedDate",
            shipment.bookedDate
        );


        setText(
            "collectionStatus",
            shipment.collectionStatus
        );


        setText(
            "transitStatus",
            shipment.transitStatus
        );


        setText(
            "deliveryStatus",
            shipment.deliveryStatus
        );


        updateTimeline(
            shipment.status
        );


        /*=============================================
                    CARGO
        =============================================*/

        setText(
            "cargoType",
            shipment.cargoType
        );


        setText(
            "cargoWeight",
            shipment.cargoWeight
        );


        setText(
            "cargoItems",
            shipment.cargoItems
        );


        /*=============================================
                    SERVICE
        =============================================*/

        setText(
            "serviceType",
            shipment.serviceType
        );


        setText(
            "shipmentPriority",
            shipment.priority
        );


        setText(
            "currentLocation",
            shipment.currentLocation
        );


        /*=============================================
                    SCROLL TO RESULT
        =============================================*/

        setTimeout(
            function () {

                shipmentResultSection.scrollIntoView(
                    {
                        behavior: "smooth",
                        block: "start"
                    }
                );

            },
            100
        );

    }



    /*=====================================================
                    UPDATE TIMELINE
    =====================================================*/

    function updateTimeline(
        status
    ) {

        const timelineItems =
            document.querySelectorAll(
                ".timeline-item"
            );


        if (!timelineItems.length) {

            return;

        }


        timelineItems.forEach(
            function (item) {

                item.classList.remove(
                    "completed",
                    "current"
                );

            }
        );


        let currentStep = 0;


        switch (
            status.toLowerCase()
        ) {

            case "loading":

                currentStep = 1;

                break;


            case "collected":

                currentStep = 2;

                break;


            case "in transit":

                currentStep = 3;

                break;


            case "delivered":

                currentStep = 4;

                break;


            default:

                currentStep = 1;

        }


        timelineItems.forEach(
            function (item, index) {

                const step =
                    index + 1;


                if (
                    step <
                    currentStep
                ) {

                    item.classList.add(
                        "completed"
                    );

                }


                if (
                    step ===
                    currentStep
                ) {

                    item.classList.add(
                        "current"
                    );

                }

            }
        );

    }



    /*=====================================================
                SET TEXT SAFELY
    =====================================================*/

    function setText(
        elementId,
        value
    ) {

        const element =
            document.getElementById(
                elementId
            );


        if (element) {

            element.textContent =
                value || "Not available";

        }

    }



    /*=====================================================
                LOADING STATE
    =====================================================*/

    function setTrackingLoadingState() {

        if (!trackButton) {

            return;

        }


        trackButton.disabled =
            true;


        trackButton.classList.add(
            "loading"
        );


        const buttonText =
            trackButton.querySelector(
                ".track-button-text"
            );


        const buttonIcon =
            trackButton.querySelector(
                ".track-button-icon i"
            );


        if (buttonText) {

            buttonText.textContent =
                "Tracking...";

        }


        if (buttonIcon) {

            buttonIcon.className =
                "fas fa-spinner fa-spin";

        }

    }



    /*=====================================================
                RESET TRACKING BUTTON
    =====================================================*/

    function resetTrackingButton() {

        if (!trackButton) {

            return;

        }


        trackButton.disabled =
            false;


        trackButton.classList.remove(
            "loading"
        );


        const buttonText =
            trackButton.querySelector(
                ".track-button-text"
            );


        const buttonIcon =
            trackButton.querySelector(
                ".track-button-icon i"
            );


        if (buttonText) {

            buttonText.textContent =
                "Track Shipment";

        }


        if (buttonIcon) {

            buttonIcon.className =
                "fas fa-location-arrow";

        }

    }



    /*=====================================================
                HIDE RESULT
    =====================================================*/

    function hideShipmentResult() {

        if (shipmentResultSection) {

            shipmentResultSection.style.display =
                "none";

        }

    }



    /*=====================================================
                TRACKING MESSAGE
    =====================================================*/

    function showTrackingMessage(
        message,
        type
    ) {

        if (!trackingMessage) {

            return;

        }


        trackingMessage.textContent =
            message;


        trackingMessage.className =
            "tracking-message " + type;


        setTimeout(
            function () {

                if (
                    trackingMessage
                ) {

                    trackingMessage.className =
                        "tracking-message";

                }

            },
            5000
        );

    }



    /*=====================================================
                CLEAR ERROR WHILE TYPING
    =====================================================*/

    if (shipmentIdInput) {

        shipmentIdInput.addEventListener(
            "input",
            function () {

                if (
                    trackingMessage
                ) {

                    trackingMessage.className =
                        "tracking-message";

                }

            }
        );

    }



    /*=====================================================
                ENTER KEY SUPPORT
    =====================================================*/

    if (shipmentIdInput) {

        shipmentIdInput.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Enter"
                ) {

                    event.preventDefault();

                    trackingForm.requestSubmit();

                }

            }
        );

    }

});