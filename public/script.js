/* =========================================
   DCURS MAIN SCRIPT
========================================= */


/* =========================================
   MOBILE MENU
========================================= */

const menuBtn =
document.querySelector(".menu-btn");


const navLinks =
document.querySelector(".nav-links");



if(menuBtn && navLinks){

    menuBtn.addEventListener(
        "click",
        ()=>{

            navLinks.classList.toggle(
                "open"
            );

        }
    );

}



/* =========================================
   MOBILE DROPDOWN
========================================= */


document
.querySelectorAll(".nav-trigger")
.forEach(button=>{


    button.addEventListener(
        "click",
        ()=>{

            const parent =
            button.closest(".nav-group");


            parent.classList.toggle(
                "active"
            );


        }
    );


});





/* =========================================
   HERO IMAGE SLIDER
========================================= */


(function(){


const heroImage =
document.querySelector(".du-hero-image");



if(!heroImage)
return;



const images = [

"assets/home/gallery-1.jpg",

"assets/home/gallery-2.jpg",

"assets/home/gallery-3.jpg",

"assets/home/gallery-4.jpg",

"assets/home/gallery-5.jpg"

];



let index = 0;



setInterval(()=>{


index++;


if(index >= images.length){

index = 0;

}



heroImage.style.opacity="0";



setTimeout(()=>{


heroImage.src =
images[index];


heroImage.style.opacity="1";



},400);



},5000);



})();






/* =========================================
   LOAD HOMEPAGE EVENTS
========================================= */


async function loadHomepageEvents(){



const container =
document.querySelector(
".event-grid"
);



if(!container)
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





container.innerHTML =

events
.slice(0,3)
.map(event=>`


<article class="event-card">


<img

src="${
event.image ||
'assets/home/gallery-2.jpg'
}"

alt="${event.title || 'Event'}"

>



<div>


<span>
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



<a href="events.html">

View Details →

</a>


</div>



</article>



`)
.join("");




}catch(error){


console.log(
"Event loading error:",
error
);


}



}




loadHomepageEvents();









/* =========================================
   LOAD NOTICES
========================================= */


async function loadHomepageNotices(){



const list =
document.querySelector(
".notice-box ul"
);



if(!list)
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




list.innerHTML =

notices
.slice(0,5)
.map(notice=>`


<li>

${notice.title || notice.message}

</li>


`)
.join("");





}catch(error){


console.log(
"Notice loading error:",
error
);



}



}



loadHomepageNotices();










/* =========================================
   SCROLL REVEAL
========================================= */


const revealElements =
document.querySelectorAll(
".section-title, .news-card, .research-card, .event-card, .publication-grid article"
);



const observer =
new IntersectionObserver(
(entries)=>{


entries.forEach(entry=>{


if(entry.isIntersecting){


entry.target.classList.add(
"show"
);



observer.unobserve(
entry.target
);



}



});



},
{

threshold:.15

}

);




revealElements.forEach(
element=>{


element.classList.add(
"reveal"
);


observer.observe(
element
);



});








/* =========================================
   SMOOTH INTERNAL LINKS
========================================= */


document
.querySelectorAll(
'a[href^="#"]'
)
.forEach(link=>{


link.addEventListener(
"click",
function(e){


const target =
document.querySelector(
this.getAttribute("href")
);



if(target){


e.preventDefault();



target.scrollIntoView({

behavior:"smooth"

});


}



});


});







/* =========================================
   CURRENT YEAR FOOTER
========================================= */


const year =
document.querySelector(
".copyright"
);



if(year){


year.innerHTML =
year.innerHTML.replace(
"2026",
new Date().getFullYear()
);


}







/* =========================================
   IMAGE ERROR FALLBACK
========================================= */


document
.querySelectorAll("img")
.forEach(img=>{


img.addEventListener(
"error",
()=>{


if(
!img.dataset.failed
){


img.dataset.failed="true";


img.src =
"assets/dcurs-logo.png";


}



});


});
