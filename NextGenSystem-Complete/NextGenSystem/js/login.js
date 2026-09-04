/*=========================================================
                    MHAMBI LOGISTICS
                    CLIENT LOGIN
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {

    /*=====================================================
                        GET ELEMENTS
    =====================================================*/

    const loginForm = document.getElementById("loginForm");

    const roleSelect = document.getElementById("loginRole");

    const emailInput = document.getElementById("email");

    const passwordInput = document.getElementById("password");

    if (window.NGS && typeof NGS.seedStaffAccounts === "function") {

        NGS.seedStaffAccounts();

    }

    const loginButton = document.getElementById("loginButton");

    const buttonText =
        loginButton
            ? loginButton.querySelector(".login-button-text")
            : null;

    const buttonIcon =
        loginButton
            ? loginButton.querySelector(".login-button-icon i")
            : null;


    /*=====================================================
                    CHECK LOGIN FORM
    =====================================================*/

    if (!loginForm) {

        console.error("Login form could not be found.");

        return;

    }


    /*=====================================================
                    LOGIN FORM SUBMISSION
    =====================================================*/

    loginForm.addEventListener("submit", function (event) {

        event.preventDefault();


        /*=================================================
                    GET USER INPUT
        =================================================*/

        const email =
            emailInput.value
                .trim()
                .toLowerCase();

        const password =
            passwordInput.value;


        /*=================================================
                    BASIC VALIDATION
        =================================================*/

        if (!email || !password) {

            showLoginMessage(
                "Please enter your email address and password.",
                "error"
            );

            return;

        }


        /*=================================================
                    STAFF PORTAL LOGIN
                (Administrator, Dispatcher, Driver,
                Finance, Fleet, Procurement, Warehouse)
        =================================================*/

        const selectedRole =
            roleSelect ? roleSelect.value : "client";

        if (selectedRole && selectedRole !== "client") {

            let staffAccounts = [];

            try {

                staffAccounts =
                    JSON.parse(
                        localStorage.getItem("staffAccounts")
                    ) || [];

            } catch (error) {

                staffAccounts = [];

            }

            const staffMember =
                staffAccounts.find(function (account) {

                    return (
                        account.role === selectedRole &&
                        account.email.toLowerCase() === email &&
                        account.password === password
                    );

                });

            if (!staffMember) {

                showLoginMessage(
                    "The email, password or portal selected is incorrect.",
                    "error"
                );

                passwordInput.value = "";

                passwordInput.focus();

                return;

            }

            setLoginLoadingState();

            localStorage.setItem(
                "loggedInStaff",
                JSON.stringify(staffMember)
            );

            localStorage.setItem(
                "isStaffLoggedIn",
                "true"
            );

            const staffDashboards = {
                admin: "../admin/admin-dashboard.html",
                dispatcher: "../dispatcher/dispatcher-dashboard.html",
                driver: "../driver/driver-dashboard.html",
                finance: "../finance/finance-dashboard.html",
                fleet: "../fleet/fleet-dashboard.html",
                procurement: "../procurement/procurement-dashboard.html",
                warehouse: "../warehouse/warehouse-dashboard.html"
            };

            setTimeout(function () {

                window.location.href =
                    staffDashboards[selectedRole] ||
                    "login.html";

            }, 800);

            return;

        }


        /*=================================================
                    GET REGISTERED COMPANIES
        =================================================*/

        let registeredCompanies = [];

        try {

            registeredCompanies =
                JSON.parse(
                    localStorage.getItem("registeredCompanies")
                ) || [];

        } catch (error) {

            console.error(
                "Could not read registered companies:",
                error
            );

            showLoginMessage(
                "We could not access the registered client information. Please try again.",
                "error"
            );

            return;

        }


        /*=================================================
                    FIND REGISTERED CLIENT
        =================================================*/

        const company =
            registeredCompanies.find(function (registeredCompany) {

                const registeredEmail =
                    (
                        registeredCompany.companyEmail ||
                        registeredCompany.email ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                return (
                    registeredEmail === email &&
                    registeredCompany.password === password
                );

            });


        /*=================================================
                    INVALID LOGIN
        =================================================*/

        if (!company) {

            showLoginMessage(
                "The email address or password is incorrect.",
                "error"
            );

            passwordInput.value = "";

            passwordInput.focus();

            return;

        }


        /*=================================================
                    START LOGIN ANIMATION
        =================================================*/

        setLoginLoadingState();


        /*=================================================
                    SAVE LOGGED-IN CLIENT
        =================================================*/

        localStorage.setItem(
            "loggedInCompany",
            JSON.stringify(company)
        );


        /*=================================================
                    SAVE LOGIN STATUS
        =================================================*/

        localStorage.setItem(
            "isLoggedIn",
            "true"
        );


        /*=================================================
                    REDIRECT TO CLIENT PORTAL
        =================================================*/

        setTimeout(function () {

            window.location.href =
                "../client/client-portal.html";

        }, 800);

    });



    /*=====================================================
                    LOGIN LOADING STATE
    =====================================================*/

    function setLoginLoadingState() {

        loginButton.disabled = true;

        loginButton.classList.add("loading");


        if (buttonText) {

            buttonText.textContent =
                "Signing In...";

        }


        if (buttonIcon) {

            buttonIcon.className =
                "fas fa-spinner";

        }

    }



    /*=====================================================
                    RESET LOGIN BUTTON
    =====================================================*/

    function resetLoginButton() {

        loginButton.disabled = false;

        loginButton.classList.remove("loading");


        if (buttonText) {

            buttonText.textContent =
                "Sign In";

        }


        if (buttonIcon) {

            buttonIcon.className =
                "fas fa-arrow-right";

        }

    }



    /*=====================================================
                    LOGIN MESSAGE
    =====================================================*/

    function showLoginMessage(message, type) {

        let messageBox =
            document.getElementById("loginMessage");


        /* Create message box if it doesn't exist */

        if (!messageBox) {

            messageBox =
                document.createElement("div");

            messageBox.id =
                "loginMessage";

            messageBox.setAttribute(
                "role",
                "alert"
            );


            loginForm.insertBefore(
                messageBox,
                loginForm.firstElementChild
            );

        }


        messageBox.textContent =
            message;


        messageBox.className =
            "login-message " + type;


        /* Remove message automatically */

        setTimeout(function () {

            if (messageBox) {

                messageBox.className =
                    "login-message";

            }

        }, 4000);

    }



    /*=====================================================
                    PASSWORD VISIBILITY
    =====================================================*/

    if (passwordInput) {

        const passwordWrapper =
            passwordInput.parentElement;


        const passwordIcon =
            passwordWrapper.querySelector("i");


        if (passwordIcon) {

            passwordIcon.style.cursor =
                "pointer";


            passwordIcon.title =
                "Show password";


            passwordIcon.addEventListener(
                "click",
                function () {

                    if (
                        passwordInput.type ===
                        "password"
                    ) {

                        passwordInput.type =
                            "text";

                        passwordIcon.className =
                            "fas fa-eye";

                        passwordIcon.title =
                            "Hide password";

                    } else {

                        passwordInput.type =
                            "password";

                        passwordIcon.className =
                            "fas fa-lock";

                        passwordIcon.title =
                            "Show password";

                    }

                }
            );

        }

    }


    /*=====================================================
                    REMEMBER ME
    =====================================================*/

    const rememberMe =
        document.getElementById("rememberMe");


    if (rememberMe) {

        const savedEmail =
            localStorage.getItem(
                "rememberedClientEmail"
            );


        if (savedEmail) {

            emailInput.value =
                savedEmail;

            rememberMe.checked =
                true;

        }


        rememberMe.addEventListener(
            "change",
            function () {

                if (rememberMe.checked) {

                    localStorage.setItem(
                        "rememberedClientEmail",
                        emailInput.value
                            .trim()
                            .toLowerCase()
                    );

                } else {

                    localStorage.removeItem(
                        "rememberedClientEmail"
                    );

                }

            }
        );

    }


    /*=====================================================
                    CLEAR LOGIN STATE ON EDIT
    =====================================================*/

    if (emailInput) {

        emailInput.addEventListener(
            "input",
            function () {

                const messageBox =
                    document.getElementById(
                        "loginMessage"
                    );


                if (messageBox) {

                    messageBox.className =
                        "login-message";

                }

            }
        );

    }


    if (passwordInput) {

        passwordInput.addEventListener(
            "input",
            function () {

                const messageBox =
                    document.getElementById(
                        "loginMessage"
                    );


                if (messageBox) {

                    messageBox.className =
                        "login-message";

                }

            }
        );

    }


});