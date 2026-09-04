/*=========================================================*
 * MHAMBI LOGISTICS
 * CLIENT SUPPORT CENTRE
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const supportForm =
        document.getElementById("supportForm");

    const supportMessage =
        document.getElementById("supportMessage");

    const supportSubmitButton =
        document.getElementById("supportSubmitButton");

    const supportSubmitText =
        document.querySelector(".support-submit-text");

    const supportSubmitIcon =
        document.querySelector(".support-submit-icon i");

    const companyNameElement =
        document.getElementById("companyName");



    /*=====================================================
                LOAD LOGGED-IN CLIENT
    =====================================================*/

    let loggedInCompany = null;


    try {

        loggedInCompany =
            JSON.parse(
                localStorage.getItem("loggedInCompany")
            );

    } catch (error) {

        console.error(
            "Could not load logged-in company:",
            error
        );

    }



    /*=====================================================
                DISPLAY COMPANY NAME
    =====================================================*/

    if (
        companyNameElement &&
        loggedInCompany
    ) {

        const companyName =
            loggedInCompany.companyName ||
            "Client";


        companyNameElement.textContent =
            companyName;

    }



    /*=====================================================
                CHECK LOGIN STATUS
    =====================================================*/

    const isLoggedIn =
        localStorage.getItem("isLoggedIn");


    if (
        isLoggedIn !== "true" ||
        !loggedInCompany
    ) {

        console.warn(
            "No active client session was found."
        );

    }



    /*=====================================================
                AUTO-FILL CLIENT INFORMATION
    =====================================================*/

    const supportName =
        document.getElementById("supportName");

    const supportEmail =
        document.getElementById("supportEmail");


    if (loggedInCompany) {


        /*-----------------------------------------------
                CONTACT PERSON
        ------------------------------------------------*/

        if (
            supportName &&
            !supportName.value
        ) {

            const firstName =
                loggedInCompany.firstName ||
                "";

            const lastName =
                loggedInCompany.lastName ||
                "";


            const fullName =
                `${firstName} ${lastName}`
                    .trim();


            if (fullName) {

                supportName.value =
                    fullName;

            }

        }



        /*-----------------------------------------------
                    COMPANY EMAIL
        ------------------------------------------------*/

        if (
            supportEmail &&
            !supportEmail.value
        ) {

            const email =
                loggedInCompany.companyEmail ||
                loggedInCompany.email ||
                "";


            if (email) {

                supportEmail.value =
                    email;

            }

        }

    }



    /*=====================================================
                    SUPPORT FORM
    =====================================================*/

    if (!supportForm) {

        console.error(
            "Support form could not be found."
        );

        return;

    }



    /*=====================================================
                FORM SUBMISSION
    =====================================================*/

    supportForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();



            /*=================================================
                    GET FORM VALUES
            =================================================*/

            const name =
                supportName
                    ? supportName.value.trim()
                    : "";

            const email =
                supportEmail
                    ? supportEmail.value.trim().toLowerCase()
                    : "";

            const category =
                document
                    .getElementById("supportCategory")
                    .value;

            const priority =
                document
                    .getElementById("supportPriority")
                    .value;

            const reference =
                document
                    .getElementById("supportReference")
                    .value.trim();

            const subject =
                document
                    .getElementById("supportSubject")
                    .value.trim();

            const description =
                document
                    .getElementById("supportDescription")
                    .value.trim();



            /*=================================================
                    VALIDATION
            =================================================*/

            if (
                !name ||
                !email ||
                !category ||
                !priority ||
                !subject ||
                !description
            ) {

                showSupportMessage(
                    "Please complete all required fields before submitting your request.",
                    "error"
                );

                return;

            }



            /*=================================================
                    EMAIL VALIDATION
            =================================================*/

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (
                !emailPattern.test(email)
            ) {

                showSupportMessage(
                    "Please enter a valid email address.",
                    "error"
                );

                return;

            }



            /*=================================================
                    START LOADING STATE
            =================================================*/

            setSupportLoadingState();



            /*=================================================
                    CREATE SUPPORT REQUEST
            =================================================*/

            const supportRequest = {

                id:
                    generateSupportReference(),

                companyName:
                    loggedInCompany
                        ? (
                            loggedInCompany.companyName ||
                            "Client"
                        )
                        : "Client",

                contactName:
                    name,

                email:
                    email,

                category:
                    category,

                priority:
                    priority,

                reference:
                    reference || "Not provided",

                subject:
                    subject,

                description:
                    description,

                status:
                    "Open",

                submittedAt:
                    new Date().toISOString()

            };



            /*=================================================
                    GET EXISTING REQUESTS
            =================================================*/

            let supportRequests = [];


            try {

                supportRequests =
                    JSON.parse(
                        localStorage.getItem(
                            "supportRequests"
                        )
                    ) || [];

            } catch (error) {

                console.error(
                    "Could not load support requests:",
                    error
                );

                supportRequests = [];

            }



            /*=================================================
                    SAVE REQUEST
            =================================================*/

            supportRequests.push(
                supportRequest
            );


            localStorage.setItem(
                "supportRequests",
                JSON.stringify(
                    supportRequests
                )
            );



            /*=================================================
                    SAVE LAST REQUEST
            =================================================*/

            localStorage.setItem(
                "lastSupportRequest",
                JSON.stringify(
                    supportRequest
                )
            );



            /*=================================================
                    SUCCESS MESSAGE
            =================================================*/

            setTimeout(
                function () {

                    resetSupportButton();


                    showSupportMessage(
                        "Your support request has been submitted successfully. Reference: " +
                        supportRequest.id,
                        "success"
                    );


                    supportForm.reset();



                    /*-----------------------------------------
                        RESTORE CLIENT INFORMATION
                    -----------------------------------------*/

                    if (
                        loggedInCompany
                    ) {

                        if (
                            supportName
                        ) {

                            const firstName =
                                loggedInCompany.firstName ||
                                "";

                            const lastName =
                                loggedInCompany.lastName ||
                                "";


                            supportName.value =
                                `${firstName} ${lastName}`
                                    .trim();

                        }


                        if (
                            supportEmail
                        ) {

                            supportEmail.value =
                                loggedInCompany.companyEmail ||
                                loggedInCompany.email ||
                                "";

                        }

                    }

                },
                900
            );

        }
    );



    /*=====================================================
                GENERATE SUPPORT REFERENCE
    =====================================================*/

    function generateSupportReference() {

        const currentYear =
            new Date().getFullYear();


        const randomNumber =
            Math.floor(
                1000 +
                Math.random() * 9000
            );


        return (
            "SUP-" +
            currentYear +
            "-" +
            randomNumber
        );

    }



    /*=====================================================
                LOADING STATE
    =====================================================*/

    function setSupportLoadingState() {

        if (!supportSubmitButton) {

            return;

        }


        supportSubmitButton.disabled =
            true;


        supportSubmitButton.classList.add(
            "loading"
        );


        if (supportSubmitText) {

            supportSubmitText.textContent =
                "Submitting Request...";

        }


        if (supportSubmitIcon) {

            supportSubmitIcon.className =
                "fas fa-spinner fa-spin";

        }

    }



    /*=====================================================
                RESET BUTTON
    =====================================================*/

    function resetSupportButton() {

        if (!supportSubmitButton) {

            return;

        }


        supportSubmitButton.disabled =
            false;


        supportSubmitButton.classList.remove(
            "loading"
        );


        if (supportSubmitText) {

            supportSubmitText.textContent =
                "Submit Support Request";

        }


        if (supportSubmitIcon) {

            supportSubmitIcon.className =
                "fas fa-paper-plane";

        }

    }



    /*=====================================================
                SUPPORT MESSAGE
    =====================================================*/

    function showSupportMessage(
        message,
        type
    ) {

        if (!supportMessage) {

            return;

        }


        supportMessage.textContent =
            message;


        supportMessage.className =
            "support-message " +
            type;


        supportMessage.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });



        /*-----------------------------------------------
                HIDE MESSAGE AFTER A FEW SECONDS
        ------------------------------------------------*/

        setTimeout(
            function () {

                if (
                    supportMessage
                ) {

                    supportMessage.className =
                        "support-message";

                }

            },
            6000
        );

    }



    /*=====================================================
                CLEAR ERROR MESSAGE
                WHEN USER EDITS FORM
    =====================================================*/

    const formInputs =
        supportForm.querySelectorAll(
            "input, select, textarea"
        );


    formInputs.forEach(
        function (input) {

            input.addEventListener(
                "input",
                function () {

                    if (
                        supportMessage
                    ) {

                        supportMessage.className =
                            "support-message";

                    }

                }
            );


            input.addEventListener(
                "change",
                function () {

                    if (
                        supportMessage
                    ) {

                        supportMessage.className =
                            "support-message";

                    }

                }
            );

        }
    );

});