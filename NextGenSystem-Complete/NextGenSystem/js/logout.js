/*=========================================================*
 * MHAMBI LOGISTICS
 * CLIENT LOGOUT
 *=========================================================*/

document.addEventListener("DOMContentLoaded", function () {


    /*=====================================================
                    GET ELEMENTS
    =====================================================*/

    const logoutStatus =
        document.getElementById("logoutStatus");



    /*=====================================================
                    LOGOUT FUNCTION
    =====================================================*/

    function performLogout() {

        try {

            /*---------------------------------------------
                    CLEAR ACTIVE CLIENT SESSION
            ---------------------------------------------*/

            localStorage.removeItem(
                "loggedInCompany"
            );


            localStorage.removeItem(
                "isLoggedIn"
            );


        } catch (error) {

            console.error(
                "Could not clear client session:",
                error
            );

        }



        /*---------------------------------------------
                    UPDATE STATUS MESSAGE
        ---------------------------------------------*/

        if (logoutStatus) {

            logoutStatus.textContent =
                "Your session has been securely closed.";

        }



        /*---------------------------------------------
                    SAVE LOGOUT TIME
        ---------------------------------------------*/

        try {

            localStorage.setItem(
                "lastLogoutTime",
                new Date().toISOString()
            );

        } catch (error) {

            console.error(
                "Could not save logout time:",
                error
            );

        }

    }



    /*=====================================================
                PERFORM LOGOUT
    =====================================================*/

    performLogout();

});