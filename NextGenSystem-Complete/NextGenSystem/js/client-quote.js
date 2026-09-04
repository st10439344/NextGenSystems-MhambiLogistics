/*=========================================================*
 * MHAMBI LOGISTICS
 * CLIENT QUOTE REQUEST
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const quoteForm =
        document.getElementById("clientQuoteForm");

    const companyNameElement =
        document.getElementById("companyName");

    const headerCompanyName =
        document.getElementById("headerCompanyName");

    const submitButton =
        document.getElementById("submitQuoteButton");

    const submitButtonText =
        submitButton
            ? submitButton.querySelector(".submit-button-text")
            : null;

    const submitButtonIcon =
        submitButton
            ? submitButton.querySelector(".submit-button-icon i")
            : null;

    const quoteMessage =
        document.getElementById("quoteMessage");


    /*=====================================================
                    CHECK QUOTE FORM
    =====================================================*/

    if (!quoteForm) {

        console.error(
            "Client quote form could not be found."
        );

        return;

    }


    /*=====================================================
                CHECK LOGIN STATUS
    =====================================================*/

    const isLoggedIn =
        localStorage.getItem("isLoggedIn");


    if (isLoggedIn !== "true") {

        window.location.href =
            "../public/login.html";

        return;

    }


    /*=====================================================
                GET LOGGED-IN COMPANY
    =====================================================*/

    let loggedInCompany = null;


    try {

        loggedInCompany =
            JSON.parse(
                localStorage.getItem("loggedInCompany")
            );

    } catch (error) {

        console.error(
            "Could not read logged-in company:",
            error
        );

    }


    /*=====================================================
                CHECK COMPANY INFORMATION
    =====================================================*/

    if (!loggedInCompany) {

        showQuoteMessage(
            "We could not identify your company account. Please sign in again.",
            "error"
        );

        setTimeout(function () {

            window.location.href =
                "../public/login.html";

        }, 2500);

        return;

    }


    /*=====================================================
                DISPLAY COMPANY NAME
    =====================================================*/

    const registeredCompanyName =
        loggedInCompany.companyName ||
        "Registered Client";


    if (companyNameElement) {

        companyNameElement.textContent =
            registeredCompanyName;

    }


    if (headerCompanyName) {

        headerCompanyName.textContent =
            registeredCompanyName;

    }


    /*=====================================================
                AUTO-FILL CONTACT DETAILS
    =====================================================*/

    const firstName =
        loggedInCompany.firstName || "";

    const lastName =
        loggedInCompany.lastName || "";

    const contactPerson =
        `${firstName} ${lastName}`
            .trim();


    const quoteContactName =
        document.getElementById(
            "quoteContactName"
        );


    const quoteContactEmail =
        document.getElementById(
            "quoteContactEmail"
        );


    const quoteContactNumber =
        document.getElementById(
            "quoteContactNumber"
        );


    if (
        quoteContactName &&
        contactPerson
    ) {

        quoteContactName.value =
            contactPerson;

    }


    if (
        quoteContactEmail &&
        loggedInCompany.companyEmail
    ) {

        quoteContactEmail.value =
            loggedInCompany.companyEmail;

    }


    if (
        quoteContactNumber &&
        loggedInCompany.contactNumber
    ) {

        quoteContactNumber.value =
            loggedInCompany.contactNumber;

    }


    /*=====================================================
                SET MINIMUM COLLECTION DATE
    =====================================================*/

    const collectionDate =
        document.getElementById(
            "collectionDate"
        );


    const deliveryDate =
        document.getElementById(
            "deliveryDate"
        );


    const today =
        new Date()
            .toISOString()
            .split("T")[0];


    if (collectionDate) {

        collectionDate.min =
            today;

    }


    if (deliveryDate) {

        deliveryDate.min =
            today;

    }


    /*=====================================================
                COLLECTION DATE CHANGE
    =====================================================*/

    if (collectionDate && deliveryDate) {

        collectionDate.addEventListener(
            "change",
            function () {

                deliveryDate.min =
                    collectionDate.value;

                if (
                    deliveryDate.value &&
                    deliveryDate.value <
                    collectionDate.value
                ) {

                    deliveryDate.value = "";

                }

            }
        );

    }


    /*=====================================================
                FORM SUBMISSION
    =====================================================*/

    quoteForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            /*=============================================
                    CHECK FORM VALIDITY
            =============================================*/

            if (!quoteForm.checkValidity()) {

                quoteForm.reportValidity();

                return;

            }


            /*=============================================
                    CHECK DELIVERY DATE
            =============================================*/

            if (
                collectionDate &&
                deliveryDate &&
                deliveryDate.value &&
                deliveryDate.value <
                collectionDate.value
            ) {

                showQuoteMessage(
                    "The delivery date cannot be earlier than the collection date.",
                    "error"
                );

                deliveryDate.focus();

                return;

            }


            /*=============================================
                    START SUBMISSION
            =============================================*/

            setQuoteLoadingState();


            /*=============================================
                    CREATE QUOTE REQUEST
            =============================================*/

            const quoteRequest =
                createQuoteRequest(
                    loggedInCompany
                );


            /*=============================================
                    SAVE QUOTE REQUEST
            =============================================*/

            try {

                saveQuoteRequest(
                    quoteRequest
                );

            } catch (error) {

                console.error(
                    "Could not save quote request:",
                    error
                );

                resetQuoteButton();

                showQuoteMessage(
                    "We could not save your quote request. Please try again.",
                    "error"
                );

                return;

            }


            /*=============================================
                    SHOW SUCCESS
            =============================================*/

            setTimeout(function () {

                resetQuoteButton();

                showQuoteSuccess(
                    quoteRequest
                );

            }, 900);

        }
    );


    /*=====================================================
                CREATE QUOTE REQUEST
    =====================================================*/

    function createQuoteRequest(company) {


        const formData =
            new FormData(quoteForm);


        const quoteRequest =
            {

                id:
                    generateQuoteNumber(),

                companyId:
                    company.registrationNumber ||
                    company.companyEmail ||
                    company.companyName,

                companyName:
                    company.companyName || "",

                registrationNumber:
                    company.registrationNumber || "",

                industry:
                    company.industry || "",


                collectionLocation:
                    formData.get(
                        "collectionLocation"
                    ) || "",

                deliveryLocation:
                    formData.get(
                        "deliveryLocation"
                    ) || "",

                collectionDate:
                    formData.get(
                        "collectionDate"
                    ) || "",

                deliveryDate:
                    formData.get(
                        "deliveryDate"
                    ) || "",


                cargoType:
                    formData.get(
                        "cargoType"
                    ) || "",

                cargoDescription:
                    formData.get(
                        "cargoDescription"
                    ) || "",

                estimatedWeight:
                    formData.get(
                        "estimatedWeight"
                    ) || "",

                numberOfItems:
                    formData.get(
                        "numberOfItems"
                    ) || "",


                serviceType:
                    formData.get(
                        "serviceType"
                    ) || "",

                vehicleType:
                    formData.get(
                        "vehicleType"
                    ) || "",

                loadType:
                    formData.get(
                        "loadType"
                    ) || "",

                priority:
                    formData.get(
                        "priority"
                    ) || "",

                loadingRequirements:
                    formData.get(
                        "loadingRequirements"
                    ) || "",

                unloadingRequirements:
                    formData.get(
                        "unloadingRequirements"
                    ) || "",

                specialRequirements:
                    formData.get(
                        "specialRequirements"
                    ) || "",


                contactPerson:
                    formData.get(
                        "quoteContactName"
                    ) || "",

                contactEmail:
                    formData.get(
                        "quoteContactEmail"
                    ) || "",

                contactNumber:
                    formData.get(
                        "quoteContactNumber"
                    ) || "",

                clientReference:
                    formData.get(
                        "clientReference"
                    ) || "",

                additionalNotes:
                    formData.get(
                        "additionalNotes"
                    ) || "",


                status:
                    "Pending Review",

                createdAt:
                    new Date().toISOString(),

                updatedAt:
                    new Date().toISOString()

            };


        return quoteRequest;

    }


    /*=====================================================
                GENERATE QUOTE NUMBER
    =====================================================*/

    function generateQuoteNumber() {


        let quoteRequests = [];


        try {

            quoteRequests =
                JSON.parse(
                    localStorage.getItem(
                        "quoteRequests"
                    )
                ) || [];

        } catch (error) {

            quoteRequests = [];

        }


        let highestNumber = 0;


        quoteRequests.forEach(
            function (quote) {

                if (!quote.id) {

                    return;

                }


                const match =
                    quote.id.match(
                        /QT-(\d+)/
                    );


                if (match) {

                    const number =
                        parseInt(
                            match[1],
                            10
                        );


                    if (
                        number >
                        highestNumber
                    ) {

                        highestNumber =
                            number;

                    }

                }

            }
        );


        const nextNumber =
            highestNumber + 1;


        return (
            "QT-" +
            String(nextNumber)
                .padStart(5, "0")
        );

    }


    /*=====================================================
                SAVE QUOTE REQUEST
    =====================================================*/

    function saveQuoteRequest(
        quoteRequest
    ) {


        let quoteRequests = [];


        try {

            quoteRequests =
                JSON.parse(
                    localStorage.getItem(
                        "quoteRequests"
                    )
                ) || [];

        } catch (error) {

            console.warn(
                "Existing quote requests could not be read. Starting a new list."
            );

            quoteRequests = [];

        }


        quoteRequests.push(
            quoteRequest
        );


        localStorage.setItem(
            "quoteRequests",
            JSON.stringify(
                quoteRequests
            )
        );


        /*=============================================
            ALSO SAVE CLIENT-SPECIFIC QUOTES
        =============================================*/

        const companyKey =
            quoteRequest.companyId;


        let companyQuotes = [];


        try {

            companyQuotes =
                JSON.parse(
                    localStorage.getItem(
                        "clientQuotes_" +
                        companyKey
                    )
                ) || [];

        } catch (error) {

            companyQuotes = [];

        }


        companyQuotes.push(
            quoteRequest
        );


        localStorage.setItem(
            "clientQuotes_" +
            companyKey,
            JSON.stringify(
                companyQuotes
            )
        );

    }


    /*=====================================================
                LOADING BUTTON STATE
    =====================================================*/

    function setQuoteLoadingState() {


        if (!submitButton) {

            return;

        }


        submitButton.disabled =
            true;


        submitButton.classList.add(
            "loading"
        );


        if (submitButtonText) {

            submitButtonText.textContent =
                "Submitting Request...";

        }


        if (submitButtonIcon) {

            submitButtonIcon.className =
                "fas fa-spinner fa-spin";

        }

    }


    /*=====================================================
                RESET BUTTON STATE
    =====================================================*/

    function resetQuoteButton() {


        if (!submitButton) {

            return;

        }


        submitButton.disabled =
            false;


        submitButton.classList.remove(
            "loading"
        );


        if (submitButtonText) {

            submitButtonText.textContent =
                "Submit Quote Request";

        }


        if (submitButtonIcon) {

            submitButtonIcon.className =
                "fas fa-paper-plane";

        }

    }


    /*=====================================================
                DISPLAY MESSAGE
    =====================================================*/

    function showQuoteMessage(
        message,
        type
    ) {


        if (!quoteMessage) {

            return;

        }


        quoteMessage.textContent =
            message;


        quoteMessage.className =
            "quote-message " +
            type;


        quoteMessage.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });


        setTimeout(
            function () {

                if (quoteMessage) {

                    quoteMessage.className =
                        "quote-message";

                }

            },
            6000
        );

    }


    /*=====================================================
                SUCCESS MESSAGE
    =====================================================*/

    function showQuoteSuccess(
        quoteRequest
    ) {


        if (!quoteMessage) {

            return;

        }


        quoteMessage.innerHTML =

            `
                <div class="quote-success-content">

                    <div class="quote-success-icon">

                        <i class="fas fa-check"></i>

                    </div>

                    <div>

                        <span class="section-tag">

                            REQUEST RECEIVED

                        </span>

                        <h3>

                            Quote Request Submitted Successfully

                        </h3>

                        <p>

                            Your quotation request

                            <strong>
                                ${quoteRequest.id}
                            </strong>

                            has been submitted to the
                            Mhambi Logistics team.

                        </p>

                        <p>

                            <strong>
                                ${quoteRequest.companyName}
                            </strong>

                            can track the progress of this
                            request from the client portal.

                        </p>

                        <div class="quote-success-actions">

                            <a
                                href="shipment-history.html"
                                class="quote-btn">

                                View Requests

                                <i class="fas fa-arrow-right"></i>

                            </a>

                            <a
                                href="client-portal.html"
                                class="track-btn">

                                Back to Dashboard

                            </a>

                        </div>

                    </div>

                </div>
            `;


        quoteMessage.className =
            "quote-message success";


        quoteMessage.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });


        /*=============================================
                CLEAR FORM AFTER SUCCESS
        =============================================*/

        quoteForm.reset();


        /*=============================================
                RESTORE CLIENT DETAILS
        =============================================*/

        if (
            quoteContactName &&
            contactPerson
        ) {

            quoteContactName.value =
                contactPerson;

        }


        if (
            quoteContactEmail &&
            loggedInCompany.companyEmail
        ) {

            quoteContactEmail.value =
                loggedInCompany.companyEmail;

        }


        if (
            quoteContactNumber &&
            loggedInCompany.contactNumber
        ) {

            quoteContactNumber.value =
                loggedInCompany.contactNumber;

        }

    }


});