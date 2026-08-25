document
.getElementById("membershipForm")
.addEventListener("submit", async function(e){

e.preventDefault();


const data = Object.fromEntries(
new FormData(this)
);



try{


const response = await fetch("/api/register",{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

name:data.name,

email:data.email,

password:data.email,

department:data.department,

student_id:data.studentId,

research_interest:data.interests

})

});



const result = await response.json();



if(!response.ok){

alert(result.error);

return;

}



document.getElementById("successBox").hidden=false;


document.getElementById("applicationId").innerText="Submitted";


this.reset();



}


catch(error){

console.log(error);

alert("Server error");

}



});
