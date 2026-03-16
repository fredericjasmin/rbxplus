document.addEventListener("DOMContentLoaded", () => {
    const menuIcon = document.getElementById("menu-icon");
    const closeIcon = document.getElementById("close-icon");
    const navid = document.getElementById("navid");
    const navbar = document.getElementById("navbar");

    menuIcon.addEventListener("click", () => {
        navid.classList.toggle("show");
        navbar.classList.toggle("show");
    });

    closeIcon.addEventListener("click", () => {
        navid.classList.toggle("show");
        navbar.classList.toggle("show");
    });
});