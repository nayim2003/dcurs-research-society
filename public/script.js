/* =====================================================
   DCURS FINAL SCRIPT
===================================================== */


/* =========================
   MOBILE MENU
========================= */


const dcursMenuBtn = document.querySelector(".menu-btn");

const dcursNavLinks = document.querySelector(".nav-links");


if(dcursMenuBtn && dcursNavLinks){

    dcursMenuBtn.addEventListener(
        "click",
        ()=>{

            dcursNavLinks.classList.toggle("open");

        }
    );

}





/* =========================
   CLOSE MOBILE MENU
========================= */


document.querySelectorAll(".nav-links a")
.forEach((dcursLink)=>{

    dcursLink.addEventListener(
        "click",
        ()=>{

            if(dcursNavLinks){

                dcursNavLinks.classList.remove("open");

            }

        }
    );

});







/* =========================
   HEADER SCROLL EFFECT
========================= */


const dcursHeader = document.querySelector(".site-header");


window.addEventListener(
"scroll",
()=>{


    if(dcursHeader){

        if(window.scrollY > 40){

            dcursHeader.style.boxShadow =
            "0 10px 30px rgba(6,36,75,.12)";

        }
        else{

            dcursHeader.style.boxShadow =
            "none";

        }

    }


});







/* =========================
   IMAGE SLIDER
========================= */


const dcursSlides =
document.querySelectorAll(".dcurs-slider img");


let dcursSlideIndex = 0;



function dcursAutoSlider(){


    if(dcursSlides.length === 0){

        return;

    }


    dcursSlides.forEach(
        (dcursImg)=>{

            dcursImg.style.opacity="0";

        }
    );



    dcursSlides[dcursSlideIndex]
    .style.opacity="1";



    dcursSlideIndex++;



    if(dcursSlideIndex >= dcursSlides.length){

        dcursSlideIndex = 0;

    }


}



if(dcursSlides.length > 0){

    dcursAutoSlider();


    setInterval(
        dcursAutoSlider,
        10000
    );

}








/* =========================
   PASSWORD TOGGLE
========================= */


document.querySelectorAll(".password-toggle")
.forEach(
(dcursButton)=>{


    dcursButton.addEventListener(
    "click",
    ()=>{


        const dcursInput =
        dcursButton
        .parentElement
        .querySelector("input");



        if(!dcursInput){

            return;

        }



        if(dcursInput.type === "password"){


            dcursInput.type="text";


            dcursButton.innerText=
            "Hide";


        }
        else{


            dcursInput.type="password";


            dcursButton.innerText=
            "Show";


        }



    });

});








/* =========================
   SCROLL ANIMATION
========================= */


const dcursObserver =
new IntersectionObserver(
(entries)=>{


    entries.forEach(
    (entry)=>{


        if(entry.isIntersecting){


            entry.target.classList.add(
                "dcurs-visible"
            );


        }


    });


},
{
    threshold:.15
});




document
.querySelectorAll(".card, .info-card, .dcurs-project-card, .dcurs-member-card")
.forEach(
(dcursItem)=>{


    dcursItem.classList.add(
        "dcurs-hidden"
    );


    dcursObserver.observe(
        dcursItem
    );


});







/* =========================
   FOOTER YEAR
========================= */


const dcursYear =
document.querySelector(".dcurs-year");



if(dcursYear){

    dcursYear.innerText =
    new Date().getFullYear();

}
