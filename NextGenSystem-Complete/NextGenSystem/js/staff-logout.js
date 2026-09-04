/*=========================================================
    MHAMBI LOGISTICS
    STAFF LOGOUT
    Shared by every role's logout.html page.
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {

    const logoutStatus = document.getElementById("logoutStatus");

    function performLogout() {

        try {
            localStorage.removeItem("loggedInStaff");
            localStorage.removeItem("isStaffLoggedIn");
        } catch (error) {
            console.error("Could not clear staff session:", error);
        }

        if (logoutStatus) {
            logoutStatus.textContent = "Your session has been securely closed.";
        }

        try {
            localStorage.setItem("lastStaffLogoutTime", new Date().toISOString());
        } catch (error) {
            console.error("Could not save logout time:", error);
        }
    }

    performLogout();

});
