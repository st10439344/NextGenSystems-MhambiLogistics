/*=========================================================*
 * MHAMBI LOGISTICS
 * COMPANY PROFILE
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET LOGGED-IN CLIENT
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
                    SECURITY CHECK
    =====================================================*/

    const isLoggedIn =
        localStorage.getItem("isLoggedIn");


    if (
        isLoggedIn !== "true" ||
        !loggedInCompany
    ) {

        window.location.href =
            "login.html";

        return;

    }



    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const companyName =
        document.getElementById("companyName");

    const profileCompanyName =
        document.getElementById(
            "profileCompanyName"
        );

    const profileIndustry =
        document.getElementById(
            "profileIndustry"
        );

    const companyNameDetail =
        document.getElementById(
            "companyNameDetail"
        );

    const registrationNumberDetail =
        document.getElementById(
            "registrationNumberDetail"
        );

    const vatNumberDetail =
        document.getElementById(
            "vatNumberDetail"
        );

    const industryDetail =
        document.getElementById(
            "industryDetail"
        );

    const contactPersonDetail =
        document.getElementById(
            "contactPersonDetail"
        );

    const jobTitleDetail =
        document.getElementById(
            "jobTitleDetail"
        );

    const companyEmailDetail =
        document.getElementById(
            "companyEmailDetail"
        );

    const contactNumberDetail =
        document.getElementById(
            "contactNumberDetail"
        );

    const addressCompanyName =
        document.getElementById(
            "addressCompanyName"
        );

    const physicalAddressDetail =
        document.getElementById(
            "physicalAddressDetail"
        );

    const cityDetail =
        document.getElementById(
            "cityDetail"
        );

    const provinceDetail =
        document.getElementById(
            "provinceDetail"
        );

    const postalCodeDetail =
        document.getElementById(
            "postalCodeDetail"
        );

    const usernameDetail =
        document.getElementById(
            "usernameDetail"
        );



    /*=====================================================
                SAFE VALUE HELPER
    =====================================================*/

    function getValue(value) {

        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {

            return "Not provided";

        }

        return value;

    }



    /*=====================================================
                GET CONTACT PERSON NAME
    =====================================================*/

    function getContactPerson() {

        const firstName =
            loggedInCompany.firstName || "";

        const lastName =
            loggedInCompany.lastName || "";

        const fullName =
            `${firstName} ${lastName}`.trim();


        return fullName ||
            "Not provided";

    }



    /*=====================================================
                DISPLAY COMPANY INFORMATION
    =====================================================*/

    function displayCompanyInformation() {

        const company =
            getValue(
                loggedInCompany.companyName
            );


        const industry =
            getValue(
                loggedInCompany.industry
            );


        const registrationNumber =
            getValue(
                loggedInCompany.registrationNumber
            );


        const vatNumber =
            getValue(
                loggedInCompany.vatNumber
            );


        const contactPerson =
            getContactPerson();


        const jobTitle =
            getValue(
                loggedInCompany.jobTitle
            );


        const email =
            getValue(
                loggedInCompany.companyEmail ||
                loggedInCompany.email
            );


        const contactNumber =
            getValue(
                loggedInCompany.contactNumber
            );


        const physicalAddress =
            getValue(
                loggedInCompany.physicalAddress
            );


        const city =
            getValue(
                loggedInCompany.city
            );


        const province =
            getValue(
                loggedInCompany.province
            );


        const postalCode =
            getValue(
                loggedInCompany.postalCode
            );


        const username =
            getValue(
                loggedInCompany.username
            );



        /*=================================================
                    HEADER
        =================================================*/

        if (companyName) {

            companyName.textContent =
                company;

        }



        /*=================================================
                    COMPANY OVERVIEW
        =================================================*/

        if (profileCompanyName) {

            profileCompanyName.textContent =
                company;

        }


        if (profileIndustry) {

            profileIndustry.textContent =
                industry;

        }



        /*=================================================
                    COMPANY DETAILS
        =================================================*/

        if (companyNameDetail) {

            companyNameDetail.textContent =
                company;

        }


        if (registrationNumberDetail) {

            registrationNumberDetail.textContent =
                registrationNumber;

        }


        if (vatNumberDetail) {

            vatNumberDetail.textContent =
                vatNumber;

        }


        if (industryDetail) {

            industryDetail.textContent =
                industry;

        }



        /*=================================================
                    CONTACT DETAILS
        =================================================*/

        if (contactPersonDetail) {

            contactPersonDetail.textContent =
                contactPerson;

        }


        if (jobTitleDetail) {

            jobTitleDetail.textContent =
                jobTitle;

        }


        if (companyEmailDetail) {

            companyEmailDetail.textContent =
                email;

        }


        if (contactNumberDetail) {

            contactNumberDetail.textContent =
                contactNumber;

        }



        /*=================================================
                    ADDRESS
        =================================================*/

        if (addressCompanyName) {

            addressCompanyName.textContent =
                company;

        }


        if (physicalAddressDetail) {

            physicalAddressDetail.textContent =
                physicalAddress;

        }


        if (cityDetail) {

            cityDetail.textContent =
                city;

        }


        if (provinceDetail) {

            provinceDetail.textContent =
                province;

        }


        if (postalCodeDetail) {

            postalCodeDetail.textContent =
                postalCode;

        }



        /*=================================================
                    ACCOUNT INFORMATION
        =================================================*/

        if (usernameDetail) {

            usernameDetail.textContent =
                username;

        }

    }



    /*=====================================================
                EDIT PROFILE ELEMENTS
    =====================================================*/

    const editProfileButton =
        document.getElementById(
            "editProfileButton"
        );

    const profileEditCard =
        document.getElementById(
            "profileEditCard"
        );

    const closeEditProfile =
        document.getElementById(
            "closeEditProfile"
        );

    const cancelProfileEdit =
        document.getElementById(
            "cancelProfileEdit"
        );

    const companyProfileForm =
        document.getElementById(
            "companyProfileForm"
        );



    /*=====================================================
                    EDIT FORM INPUTS
    =====================================================*/

    const editCompanyName =
        document.getElementById(
            "editCompanyName"
        );

    const editRegistrationNumber =
        document.getElementById(
            "editRegistrationNumber"
        );

    const editVatNumber =
        document.getElementById(
            "editVatNumber"
        );

    const editIndustry =
        document.getElementById(
            "editIndustry"
        );

    const editFirstName =
        document.getElementById(
            "editFirstName"
        );

    const editLastName =
        document.getElementById(
            "editLastName"
        );

    const editJobTitle =
        document.getElementById(
            "editJobTitle"
        );

    const editCompanyEmail =
        document.getElementById(
            "editCompanyEmail"
        );

    const editContactNumber =
        document.getElementById(
            "editContactNumber"
        );

    const editOfficeNumber =
        document.getElementById(
            "editOfficeNumber"
        );

    const editPhysicalAddress =
        document.getElementById(
            "editPhysicalAddress"
        );

    const editCity =
        document.getElementById(
            "editCity"
        );

    const editProvince =
        document.getElementById(
            "editProvince"
        );

    const editPostalCode =
        document.getElementById(
            "editPostalCode"
        );



    /*=====================================================
                POPULATE EDIT FORM
    =====================================================*/

    function populateEditForm() {

        if (editCompanyName) {

            editCompanyName.value =
                loggedInCompany.companyName || "";

        }


        if (editRegistrationNumber) {

            editRegistrationNumber.value =
                loggedInCompany.registrationNumber || "";

        }


        if (editVatNumber) {

            editVatNumber.value =
                loggedInCompany.vatNumber || "";

        }


        if (editIndustry) {

            editIndustry.value =
                loggedInCompany.industry || "";

        }


        if (editFirstName) {

            editFirstName.value =
                loggedInCompany.firstName || "";

        }


        if (editLastName) {

            editLastName.value =
                loggedInCompany.lastName || "";

        }


        if (editJobTitle) {

            editJobTitle.value =
                loggedInCompany.jobTitle || "";

        }


        if (editCompanyEmail) {

            editCompanyEmail.value =
                loggedInCompany.companyEmail ||
                loggedInCompany.email ||
                "";

        }


        if (editContactNumber) {

            editContactNumber.value =
                loggedInCompany.contactNumber || "";

        }


        if (editOfficeNumber) {

            editOfficeNumber.value =
                loggedInCompany.officeNumber || "";

        }


        if (editPhysicalAddress) {

            editPhysicalAddress.value =
                loggedInCompany.physicalAddress || "";

        }


        if (editCity) {

            editCity.value =
                loggedInCompany.city || "";

        }


        if (editProvince) {

            editProvince.value =
                loggedInCompany.province || "";

        }


        if (editPostalCode) {

            editPostalCode.value =
                loggedInCompany.postalCode || "";

        }

    }



    /*=====================================================
                    OPEN EDIT PROFILE
    =====================================================*/

    if (editProfileButton) {

        editProfileButton.addEventListener(
            "click",
            function () {

                populateEditForm();


                if (profileEditCard) {

                    profileEditCard.hidden =
                        false;


                    profileEditCard.classList.add(
                        "profile-edit-visible"
                    );


                    setTimeout(function () {

                        profileEditCard.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });

                    }, 100);

                }

            }
        );

    }



    /*=====================================================
                    CLOSE EDIT PROFILE
    =====================================================*/

    function closeEditPanel() {

        if (profileEditCard) {

            profileEditCard.classList.remove(
                "profile-edit-visible"
            );


            setTimeout(function () {

                profileEditCard.hidden =
                    true;

            }, 250);

        }

    }


    if (closeEditProfile) {

        closeEditProfile.addEventListener(
            "click",
            closeEditPanel
        );

    }


    if (cancelProfileEdit) {

        cancelProfileEdit.addEventListener(
            "click",
            closeEditPanel
        );

    }



    /*=====================================================
                    SAVE PROFILE
    =====================================================*/

    if (companyProfileForm) {

        companyProfileForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();


                /*=========================================
                        UPDATE COMPANY OBJECT
                =========================================*/

                loggedInCompany.companyName =
                    editCompanyName.value.trim();


                loggedInCompany.registrationNumber =
                    editRegistrationNumber.value.trim();


                loggedInCompany.vatNumber =
                    editVatNumber.value.trim();


                loggedInCompany.industry =
                    editIndustry.value;


                loggedInCompany.firstName =
                    editFirstName.value.trim();


                loggedInCompany.lastName =
                    editLastName.value.trim();


                loggedInCompany.jobTitle =
                    editJobTitle.value.trim();


                loggedInCompany.companyEmail =
                    editCompanyEmail.value
                        .trim()
                        .toLowerCase();


                loggedInCompany.contactNumber =
                    editContactNumber.value.trim();


                loggedInCompany.officeNumber =
                    editOfficeNumber.value.trim();


                loggedInCompany.physicalAddress =
                    editPhysicalAddress.value.trim();


                loggedInCompany.city =
                    editCity.value.trim();


                loggedInCompany.province =
                    editProvince.value;


                loggedInCompany.postalCode =
                    editPostalCode.value.trim();



                /*=========================================
                    UPDATE REGISTERED COMPANIES
                =========================================*/

                let registeredCompanies = [];


                try {

                    registeredCompanies =
                        JSON.parse(
                            localStorage.getItem(
                                "registeredCompanies"
                            )
                        ) || [];

                } catch (error) {

                    console.error(
                        "Could not read registered companies:",
                        error
                    );

                }



                const companyIndex =
                    registeredCompanies.findIndex(
                        function (company) {

                            return (
                                company.username ===
                                loggedInCompany.username
                            );

                        }
                    );



                if (companyIndex !== -1) {

                    registeredCompanies[
                        companyIndex
                    ] = loggedInCompany;


                    localStorage.setItem(
                        "registeredCompanies",
                        JSON.stringify(
                            registeredCompanies
                        )
                    );

                }



                /*=========================================
                        UPDATE CURRENT SESSION
                =========================================*/

                localStorage.setItem(
                    "loggedInCompany",
                    JSON.stringify(
                        loggedInCompany
                    )
                );



                /*=========================================
                        REFRESH DISPLAY
                =========================================*/

                displayCompanyInformation();



                /*=========================================
                        SUCCESS MESSAGE
                =========================================*/

                showProfileMessage(
                    "Your company profile has been updated successfully.",
                    "success"
                );


                closeEditPanel();

            }
        );

    }



    /*=====================================================
                PROFILE MESSAGE
    =====================================================*/

    function showProfileMessage(
        message,
        type
    ) {

        let messageBox =
            document.getElementById(
                "profileMessage"
            );


        if (!messageBox) {

            messageBox =
                document.createElement("div");


            messageBox.id =
                "profileMessage";


            if (profileEditCard) {

                profileEditCard.prepend(
                    messageBox
                );

            }

        }


        messageBox.textContent =
            message;


        messageBox.className =
            "profile-message " + type;


        setTimeout(function () {

            if (messageBox) {

                messageBox.className =
                    "profile-message";

            }

        }, 4500);

    }



    /*=====================================================
                    INITIALISE PAGE
    =====================================================*/

    displayCompanyInformation();

});
