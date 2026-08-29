/* =====================================================
   DCURS SITE SCRIPT
   Matching the public/ HTML structure
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* =========================
       MOBILE NAVIGATION
    ========================= */

    const dcursMenuBtn = document.querySelector(".dcurs-menu-btn");
    const dcursNavLinks = document.querySelector(".nav-links");

    if (dcursMenuBtn && dcursNavLinks) {
        dcursMenuBtn.addEventListener("click", () => {
            const dcursIsOpen = dcursNavLinks.classList.toggle("open");
            dcursMenuBtn.classList.toggle("open", dcursIsOpen);
            dcursMenuBtn.setAttribute("aria-expanded", String(dcursIsOpen));
        });
    }

    document.querySelectorAll(".nav-links > a").forEach((dcursLink) => {
        dcursLink.addEventListener("click", () => {
            if (dcursNavLinks) dcursNavLinks.classList.remove("open");
            if (dcursMenuBtn) {
                dcursMenuBtn.classList.remove("open");
                dcursMenuBtn.setAttribute("aria-expanded", "false");
            }
        });
    });

    /* =========================
       DESKTOP / MOBILE DROPDOWNS
    ========================= */

    document.querySelectorAll(".dcurs-nav-button").forEach((dcursButton) => {
        dcursButton.addEventListener("click", (dcursEvent) => {
            dcursEvent.stopPropagation();

            const dcursGroup = dcursButton.closest(".dcurs-nav-group");
            const dcursWasOpen = dcursGroup.classList.contains("open");

            document.querySelectorAll(".dcurs-nav-group.open").forEach((dcursItem) => {
                dcursItem.classList.remove("open");
                const dcursItemButton = dcursItem.querySelector(".dcurs-nav-button");
                if (dcursItemButton) dcursItemButton.setAttribute("aria-expanded", "false");
            });

            if (!dcursWasOpen) {
                dcursGroup.classList.add("open");
                dcursButton.setAttribute("aria-expanded", "true");
            }
        });
    });

    document.addEventListener("click", (dcursEvent) => {
        if (!dcursEvent.target.closest(".dcurs-nav-group")) {
            document.querySelectorAll(".dcurs-nav-group.open").forEach((dcursItem) => {
                dcursItem.classList.remove("open");
                const dcursItemButton = dcursItem.querySelector(".dcurs-nav-button");
                if (dcursItemButton) dcursItemButton.setAttribute("aria-expanded", "false");
            });
        }
    });

    /* =========================
       HEADER SCROLL STATE
    ========================= */

    const dcursHeader = document.querySelector(".site-header");

    const dcursUpdateHeader = () => {
        if (!dcursHeader) return;
        dcursHeader.classList.toggle("dcurs-scrolled", window.scrollY > 12);
    };

    dcursUpdateHeader();
    window.addEventListener("scroll", dcursUpdateHeader, { passive: true });

    /* =========================
       FULL-WINDOW HERO SLIDER
       One image visible at a time.
       The repository currently contains 5 hero photos.
    ========================= */

    const dcursSlides = document.querySelectorAll(".dcurs-hero-slider img");
    const dcursProgress = document.querySelectorAll(".dcurs-hero-progress span");
    let dcursSlideIndex = 0;
    let dcursSliderTimer = null;

    const dcursShowSlide = (dcursIndex) => {
        dcursSlides.forEach((dcursImage, dcursImageIndex) => {
            dcursImage.classList.toggle("dcurs-active", dcursImageIndex === dcursIndex);
        });

        dcursProgress.forEach((dcursDot, dcursDotIndex) => {
            dcursDot.classList.toggle("dcurs-active", dcursDotIndex === dcursIndex);
        });
    };

    const dcursStartSlider = () => {
        if (dcursSlides.length < 2) {
            if (dcursSlides.length === 1) dcursShowSlide(0);
            return;
        }

        dcursShowSlide(dcursSlideIndex);

        dcursSliderTimer = window.setInterval(() => {
            dcursSlideIndex = (dcursSlideIndex + 1) % dcursSlides.length;
            dcursShowSlide(dcursSlideIndex);
        }, 7000);
    };

    dcursStartSlider();

    /* =========================
       SCROLL REVEAL
    ========================= */

    const dcursRevealItems = document.querySelectorAll(".dcurs-reveal");

    if ("IntersectionObserver" in window) {
        const dcursObserver = new IntersectionObserver((dcursEntries, dcursObserverInstance) => {
            dcursEntries.forEach((dcursEntry) => {
                if (dcursEntry.isIntersecting) {
                    dcursEntry.target.classList.add("dcurs-visible");
                    dcursObserverInstance.unobserve(dcursEntry.target);
                }
            });
        }, { threshold: 0.12 });

        dcursRevealItems.forEach((dcursItem) => {
            dcursItem.classList.add("dcurs-hidden");
            dcursObserver.observe(dcursItem);
        });
    } else {
        dcursRevealItems.forEach((dcursItem) => dcursItem.classList.add("dcurs-visible"));
    }

    /* =========================
       FOOTER YEAR
    ========================= */

    const dcursYear = document.querySelector(".dcurs-year");

    if (dcursYear) {
        dcursYear.textContent = new Date().getFullYear();
    }

    /* =========================
       PASSWORD TOGGLE
       Keeps compatibility with login pages.
    ========================= */

    document.querySelectorAll(".password-toggle").forEach((dcursButton) => {
        dcursButton.addEventListener("click", () => {
            const dcursInput = dcursButton.parentElement
                ? dcursButton.parentElement.querySelector("input")
                : null;

            if (!dcursInput) return;

            const dcursShowPassword = dcursInput.type === "password";
            dcursInput.type = dcursShowPassword ? "text" : "password";
            dcursButton.textContent = dcursShowPassword ? "Hide" : "Show";
        });
    });

    /* Prevent unused-timer lint warnings in simple deployments. */
    void dcursSliderTimer;
});
