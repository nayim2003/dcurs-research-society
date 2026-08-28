/* =====================================================
   DCURS MAIN JAVASCRIPT
===================================================== */



/* =====================================================
   DCURS MOBILE MENU
===================================================== */


const dcursMenuButton =
document.querySelector(".dcurs-menu-btn");


const dcursNavigation =
document.querySelector(".nav-links");



if(
    dcursMenuButton &&
    dcursNavigation
){

    dcursMenuButton.addEventListener(
        "click",
        ()=>{

            dcursNavigation.classList.toggle(
                "open"
            );

        }
    );

}






/* =====================================================
   DCURS MOBILE DROPDOWN
===================================================== */


document
.querySelectorAll(".dcurs-nav-button")
.forEach(button=>{


    button.addEventListener(
        "click",
        ()=>{


            const parent =
            button.closest(
                ".dcurs-nav-group"
            );


            if(parent){

                parent.classList.toggle(
                    "active"
                );

            }


        }
    );


});







/* =====================================================
   DCURS HERO IMAGE SLIDER
===================================================== */


(function dcursHeroSlider(){


const dcursHeroImage =
document.querySelector(
    ".dcurs-hero-image"
);



if(!dcursHeroImage)
return;



const dcursHeroImages = [

"assets/home/gallery-1.jpg",

"assets/home/gallery-2.jpg",

"assets/home/gallery-3.jpg",

"assets/home/gallery-4.jpg",

"assets/home/gallery-5.jpg"

];



let dcursHeroIndex = 0;




setInterval(()=>{


dcursHeroIndex++;



if(
dcursHeroIndex >=
dcursHeroImages.length
){

    dcursHeroIndex = 0;

}



dcursHeroImage.style.opacity="0";



setTimeout(()=>{


dcursHeroImage.src =
dcursHeroImages[
    dcursHeroIndex
];



dcursHeroImage.style.opacity="1";



},400);



},5000);



})();









/* =====================================================
   DCURS LOAD EVENTS
===================================================== */


async function dcursLoadEvents(){


const dcursEventContainer =
document.querySelector(
    ".dcurs-event-grid"
);



if(!dcursEventContainer)
return;




try{


const response =
await fetch(
    "/api/public/events"
);



if(!response.ok)
return;



const events =
await response.json();




if(
!Array.isArray(events)
||
events.length===0
)
return;





dcursEventContainer.innerHTML =


events
.slice(0,3)
.map(event=>`


<article class="dcurs-event-card">


<img

src="${
event.image ||
"assets/home/gallery-2.jpg"
}"

alt="${
event.title || "DCURS Event"
}"

>



<div class="dcurs-event-content">



<span class="dcurs-event-category">

EVENT

</span>




<h3>

${event.title || ""}

</h3>




<p>

${
event.description ||
"Upcoming DCURS activity."
}

</p>




<a href="events.html"
class="dcurs-link">

View Details →

</a>



</div>



</article>



`)
.join("");




}

catch(error){


console.log(
"DCURS event error:",
error
);


}


}



dcursLoadEvents();









/* =====================================================
   DCURS LOAD NOTICES
===================================================== */


async function dcursLoadNotices(){



const dcursNoticeList =
document.querySelector(
    ".dcurs-notice-box ul"
);



if(!dcursNoticeList)
return;




try{


const response =
await fetch(
    "/api/public/notices"
);



if(!response.ok)
return;




const notices =
await response.json();




if(
!Array.isArray(notices)
)
return;





dcursNoticeList.innerHTML =


notices
.slice(0,5)
.map(notice=>`


<li>

${
notice.title ||
notice.message ||
"Latest notice"
}

</li>


`)
.join("");




}

catch(error){


console.log(
"DCURS notice error:",
error
);


}



}



dcursLoadNotices();









/* =====================================================
   DCURS SCROLL ANIMATION
===================================================== */


const dcursRevealElements =
document.querySelectorAll(

".dcurs-section-title, \
.dcurs-news-card, \
.dcurs-research-card, \
.dcurs-event-card, \
.dcurs-publication-card"

);




const dcursObserver =
new IntersectionObserver(

(entries)=>{


entries.forEach(entry=>{


if(
entry.isIntersecting
){


entry.target.classList.add(
"show"
);



dcursObserver.unobserve(
entry.target
);


}



});



},
{

threshold:.15

}

);





dcursRevealElements.forEach(element=>{


element.classList.add(
"dcurs-reveal"
);



dcursObserver.observe(
element
);



});









/* =====================================================
   DCURS SMOOTH SCROLL
===================================================== */


document
.querySelectorAll(
'a[href^="#"]'
)
.forEach(link=>{


link.addEventListener(
"click",
event=>{


const target =
document.querySelector(
link.getAttribute("href")
);



if(target){


event.preventDefault();



target.scrollIntoView({

behavior:"smooth"

});


}



});


});









/* =====================================================
   DCURS FOOTER YEAR
===================================================== */


const dcursCopyright =
document.querySelector(
".dcurs-copyright"
);



if(dcursCopyright){


dcursCopyright.innerHTML =
dcursCopyright.innerHTML.replace(

"2026",

new Date()
.getFullYear()

);


}









/* =====================================================
   DCURS IMAGE FALLBACK
===================================================== */


document
.querySelectorAll("img")
.forEach(image=>{


image.addEventListener(
"error",
()=>{


if(
!image.dataset.error
){


image.dataset.error =
"true";



image.src =
"assets/dcurs-logo.png";


}



});


});
