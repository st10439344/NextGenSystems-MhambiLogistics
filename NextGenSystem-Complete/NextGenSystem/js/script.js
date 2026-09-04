/*=========================================================
    MHAMBI LOGISTICS
    Enterprise Logistics Management Platform
    Developed by NextGen Systems
=========================================================*/

document.addEventListener("DOMContentLoaded", () => {

    /*=====================================================
                    STICKY NAVIGATION
    =====================================================*/

    const header = document.querySelector("header");

    window.addEventListener("scroll", () => {

        if (window.scrollY > 80) {

            header.style.padding = "0";

            header.style.boxShadow =
                "0 10px 30px rgba(0,0,0,.15)";

        }

        else {

            header.style.padding = "";

            header.style.boxShadow =
                "0 15px 35px rgba(0,0,0,.08)";

        }

    });

    /*=====================================================
                    HERO IMAGE SLIDER
    =====================================================*/

    const hero = document.querySelector(".hero");

    const heroImages = [

        "../images/hero/hero1.jpg",

        "../images/hero/hero2.jpg",

        "../images/hero/hero3.jpg",

        "../images/hero/hero4.jpg"

    ];

    let currentImage = 0;

    function changeHeroImage() {

        currentImage++;

        if (currentImage >= heroImages.length) {

            currentImage = 0;

        }

        hero.style.backgroundImage =
            `linear-gradient(rgba(7,33,61,.75),
            rgba(7,33,61,.75)),
            url('${heroImages[currentImage]}')`;

    }

    setInterval(changeHeroImage, 5000);

    /*=====================================================
                SMOOTH SCROLLING
    =====================================================*/

    const links =
        document.querySelectorAll('a[href^="#"]');

    links.forEach(link => {

        link.addEventListener("click", function (e) {

            e.preventDefault();

            const target =
                document.querySelector(this.getAttribute("href"));

            if (target) {

                target.scrollIntoView({

                    behavior: "smooth"

                });

            }

        });

    });

});
    /*=====================================================
                ANIMATED STATISTICS
    =====================================================*/

    const counters = document.querySelectorAll(".counter");

    const startCounter = (counter) => {

        const target =
            Number(counter.getAttribute("data-target"));

        let count = 0;

        const speed = target / 150;

        const updateCounter = () => {

            if (count < target) {

                count += speed;

                counter.innerText =
                    Math.ceil(count) + "+";

                requestAnimationFrame(updateCounter);

            }

            else {

                counter.innerText = target + "+";

            }

        };

        updateCounter();

    };

    const counterObserver = new IntersectionObserver(

        (entries) => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    startCounter(entry.target);

                    counterObserver.unobserve(entry.target);

                }

            });

        },

        {

            threshold: 0.6

        }

    );

    counters.forEach(counter => {

        counterObserver.observe(counter);

    });

    /*=====================================================
                    BACK TO TOP BUTTON
    =====================================================*/

    const backToTop =
        document.querySelector(".back-to-top");

    window.addEventListener("scroll", () => {

        if (window.pageYOffset > 500) {

            backToTop.style.opacity = "1";

            backToTop.style.visibility = "visible";

        }

        else {

            backToTop.style.opacity = "0";

            backToTop.style.visibility = "hidden";

        }

    });

    backToTop.addEventListener("click", () => {

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    });

    /*=====================================================
                SCROLL ANIMATIONS
    =====================================================*/

    const animatedSections = document.querySelectorAll(

        ".feature-card, \
        .service-card, \
        .stat-card, \
        .industry-card, \
        .why-card, \
        .testimonial-card, \
        .process-card"

    );

    const animationObserver = new IntersectionObserver(

        (entries) => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.style.opacity = "1";

                    entry.target.style.transform =
                        "translateY(0)";

                }

            });

        },

        {

            threshold: 0.2

        }

    );

    animatedSections.forEach(section => {

        section.style.opacity = "0";

        section.style.transform = "translateY(60px)";

        section.style.transition =
            "all .8s ease";

        animationObserver.observe(section);

    });
        /*=====================================================
                ACTIVE NAVIGATION
    =====================================================*/

    const navLinks =
        document.querySelectorAll(".nav-links a");

    const currentPage =
        window.location.pathname.split("/").pop();

    navLinks.forEach(link => {

        const linkPage =
            link.getAttribute("href");

        if (linkPage === currentPage) {

            link.classList.add("active");

        }

    });

    /*=====================================================
                IMAGE HOVER EFFECT
    =====================================================*/

    const images =
        document.querySelectorAll(

            ".service-card img, \
             .industry-card img, \
             .about-image img, \
             .fleet-image img"

        );

    images.forEach(image => {

        image.addEventListener("mouseenter", () => {

            image.style.transform = "scale(1.08)";

        });

        image.addEventListener("mouseleave", () => {

            image.style.transform = "scale(1)";

        });

    });

    /*=====================================================
                BUTTON RIPPLE EFFECT
    =====================================================*/

    const buttons =
        document.querySelectorAll(

            ".primary-btn, \
             .secondary-btn, \
             .quote-btn, \
             .track-btn, \
             .login-btn"

        );

    buttons.forEach(button => {

        button.addEventListener("click", function (e) {

            const ripple =
                document.createElement("span");

            const diameter =
                Math.max(

                    button.clientWidth,

                    button.clientHeight

                );

            ripple.style.width = diameter + "px";
            ripple.style.height = diameter + "px";

            ripple.style.left =
                e.offsetX - diameter / 2 + "px";

            ripple.style.top =
                e.offsetY - diameter / 2 + "px";

            ripple.classList.add("ripple");

            const oldRipple =
                button.querySelector(".ripple");

            if (oldRipple) {

                oldRipple.remove();

            }

            button.appendChild(ripple);

        });

    });

    /*=====================================================
                PRELOAD HERO IMAGES
    =====================================================*/

    heroImages.forEach(image => {

        const preload = new Image();

        preload.src = image;

    });

    /*=====================================================
                CONSOLE MESSAGE
    =====================================================*/

    console.log(
        "%cMhambi Logistics Enterprise Logistics Management Platform",
        "color:#0A3D62;font-size:18px;font-weight:bold;"
    );

    console.log(
        "%cDesigned & Developed by NextGen Systems",
        "color:#F7941D;font-size:15px;font-weight:bold;"
    );


/*=========================================================
                END OF SCRIPT
=========================================================*/