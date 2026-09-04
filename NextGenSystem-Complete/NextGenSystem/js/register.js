/*=========================================================
    MHAMBI LOGISTICS
    CLIENT REGISTRATION
    Developed by NextGen Systems
=========================================================*/

document.addEventListener("DOMContentLoaded", () => {

    const registrationForm =
        document.getElementById("companyRegistrationForm");

    if (!registrationForm) {
        return;
    }

    registrationForm.addEventListener("submit", function (event) {

        event.preventDefault();

        /*=================================================
                    GET FORM VALUES
        =================================================*/

        const companyName =
            document.getElementById("companyName").value.trim();

        const registrationNumber =
            document.getElementById("registrationNumber").value.trim();

        const vatNumber =
            document.getElementById("vatNumber").value.trim();

        const industry =
            document.getElementById("industry").value;

        const physicalAddress =
            document.getElementById("physicalAddress").value.trim();

        const city =
            document.getElementById("city").value.trim();

        const province =
            document.getElementById("province").value;

        const postalCode =
            document.getElementById("postalCode").value.trim();

        const firstName =
            document.getElementById("firstName").value.trim();

        const lastName =
            document.getElementById("lastName").value.trim();

        const jobTitle =
            document.getElementById("jobTitle").value.trim();

        const companyEmail =
            document.getElementById("companyEmail").value.trim();

        const contactNumber =
            document.getElementById("contactNumber").value.trim();

        const officeNumber =
            document.getElementById("officeNumber").value.trim();

        const username =
            document.getElementById("username").value.trim();

        const password =
            document.getElementById("password").value;

        const confirmPassword =
            document.getElementById("confirmPassword").value;

        const terms =
            document.getElementById("terms").checked;


        /*=================================================
                    VALIDATION
        =================================================*/

        if (!companyName ||
            !registrationNumber ||
            !industry ||
            !physicalAddress ||
            !city ||
            !province ||
            !postalCode ||
            !firstName ||
            !lastName ||
            !jobTitle ||
            !companyEmail ||
            !contactNumber ||
            !username ||
            !password ||
            !confirmPassword) {

            alert(
                "Please complete all required fields before continuing."
            );

            return;

        }


        /*=================================================
                    CHECK PASSWORDS
        =================================================*/

        if (password !== confirmPassword) {

            alert(
                "The passwords do not match. Please try again."
            );

            return;

        }


        /*=================================================
                    TERMS AND CONDITIONS
        =================================================*/

        if (!terms) {

            alert(
                "Please accept the Terms and Conditions before registering."
            );

            return;

        }


        /*=================================================
                    CHECK EXISTING CLIENTS
        =================================================*/

        let registeredCompanies =
            JSON.parse(
                localStorage.getItem("registeredCompanies")
            ) || [];


        /*=================================================
                    CHECK DUPLICATE USERNAME
        =================================================*/

        const usernameExists =
            registeredCompanies.some(
                company =>
                    company.username.toLowerCase() ===
                    username.toLowerCase()
            );

        if (usernameExists) {

            alert(
                "This username is already registered. Please choose another username."
            );

            return;

        }


        /*=================================================
                    CHECK DUPLICATE EMAIL
        =================================================*/

        const emailExists =
            registeredCompanies.some(
                company =>
                    company.companyEmail.toLowerCase() ===
                    companyEmail.toLowerCase()
            );

        if (emailExists) {

            alert(
                "This email address is already registered."
            );

            return;

        }


        /*=================================================
                    GENERATE CLIENT ID
        =================================================*/

        const clientID =
            "MHM-" +
            new Date().getFullYear() +
            "-" +
            String(registeredCompanies.length + 1)
                .padStart(3, "0");


        /*=================================================
                    CREATE CLIENT OBJECT
        =================================================*/

        const company = {

            clientID: clientID,

            companyName: companyName,

            registrationNumber: registrationNumber,

            vatNumber: vatNumber,

            industry: industry,

            physicalAddress: physicalAddress,

            city: city,

            province: province,

            postalCode: postalCode,

            firstName: firstName,

            lastName: lastName,

            jobTitle: jobTitle,

            companyEmail: companyEmail,

            contactNumber: contactNumber,

            officeNumber: officeNumber,

            username: username,

            password: password,

            accountStatus: "Active",

            registeredDate:
                new Date().toISOString()

        };


        /*=================================================
                    SAVE CLIENT
        =================================================*/

        registeredCompanies.push(company);

        localStorage.setItem(
            "registeredCompanies",
            JSON.stringify(registeredCompanies)
        );


        /*=================================================
                    REMEMBER LAST REGISTERED CLIENT
        =================================================*/

        localStorage.setItem(
            "lastRegisteredCompany",
            JSON.stringify(company)
        );


        /*=================================================
                    SUCCESS MESSAGE
        =================================================*/

        alert(
            "Company registration successful!\n\n" +
            "Client ID: " + clientID +
            "\n\nYou can now log in using your username and password."
        );


        /*=================================================
                    REDIRECT TO LOGIN
        =================================================*/

        window.location.href = "login.html";

    });

});