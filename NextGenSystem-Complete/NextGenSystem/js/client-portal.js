/*=========================================================
            MHAMBI LOGISTICS
            CLIENT PORTAL JAVASCRIPT
=========================================================*/


document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET LOGGED-IN CLIENT
    =====================================================*/

    const loggedInCompany =
        localStorage.getItem("loggedInCompany");


    /*
        If there is no logged-in company, the user
        should not be allowed to access the portal.
    */

    if (!loggedInCompany) {

        window.location.href = "login.html";

        return;

    }


    /*=====================================================
                CONVERT STORED DATA TO OBJECT
    =====================================================*/

    let company;

    try {

        company = JSON.parse(loggedInCompany);

    } catch (error) {

        console.error(
            "Unable to read logged-in company information:",
            error
        );

        localStorage.removeItem("loggedInCompany");

        window.location.href = "login.html";

        return;

    }


    /*=====================================================
                    HELPER FUNCTION
    =====================================================*/

    function setElementText(id, value) {

        const element =
            document.getElementById(id);


        if (element) {

            element.textContent =
                value || "—";

        }

    }


    /*=====================================================
                    COMPANY NAME
    =====================================================*/

    const companyName =
        company.companyName || "Client";


    /*
        Header
    */

    setElementText(
        "companyName",
        companyName
    );


    /*
        Hero
    */

    setElementText(
        "companyHero",
        companyName
    );


    /*
        Company Profile
    */

    setElementText(
        "profileCompanyName",
        companyName
    );


    /*=====================================================
                COMPANY INFORMATION
    =====================================================*/

    setElementText(
        "profileRegistrationNumber",
        company.registrationNumber
    );


    setElementText(
        "profileVatNumber",
        company.vatNumber
    );


    setElementText(
        "profileIndustry",
        company.industry
    );


    setElementText(
        "profileAddress",
        company.physicalAddress
    );


    /*=====================================================
                    LOCATION
    =====================================================*/

    let location = "—";


    if (
        company.city &&
        company.province &&
        company.postalCode
    ) {

        location =
            `${company.city}, ${company.province}, ${company.postalCode}`;

    }

    else if (
        company.city &&
        company.province
    ) {

        location =
            `${company.city}, ${company.province}`;

    }

    else if (company.city) {

        location =
            company.city;

    }


    setElementText(
        "profileLocation",
        location
    );


    /*=====================================================
                PRIMARY CONTACT PERSON
    =====================================================*/

    let contactPerson = "—";


    if (
        company.firstName &&
        company.lastName
    ) {

        contactPerson =
            `${company.firstName} ${company.lastName}`;

    }

    else if (company.firstName) {

        contactPerson =
            company.firstName;

    }

    else if (company.lastName) {

        contactPerson =
            company.lastName;

    }


    setElementText(
        "profileContactPerson",
        contactPerson
    );


    /*=====================================================
                    JOB TITLE
    =====================================================*/

    setElementText(
        "profileJobTitle",
        company.jobTitle
    );


    /*=====================================================
                    COMPANY EMAIL
    =====================================================*/

    setElementText(
        "profileEmail",
        company.companyEmail
    );


    /*=====================================================
                    CONTACT NUMBER
    =====================================================*/

    setElementText(
        "profileContactNumber",
        company.contactNumber
    );


    /*=====================================================
                    OFFICE NUMBER
    =====================================================*/

    setElementText(
        "profileOfficeNumber",
        company.officeNumber
    );


    /*=====================================================
                        LOGOUT
    =====================================================*/

    const logoutButton =
        document.getElementById("logoutButton");


    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();


                /*
                    Remove the logged-in company
                    from localStorage.
                */

                localStorage.removeItem(
                    "loggedInCompany"
                );


                /*
                    Remove login status if your
                    login system uses it.
                */

                localStorage.removeItem(
                    "isLoggedIn"
                );


                /*
                    Send the client back to login.
                */

                window.location.href =
                    "login.html";

            }
        );

    }


    /*=====================================================
                CLIENT PORTAL READY
    =====================================================*/

    console.log(
        "Client Portal loaded successfully for:",
        companyName
    );

});