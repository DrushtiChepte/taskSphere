//calendar
function navigate(month, year) {
  if (month < 0) {
    month = 11;
    year--;
  } else if (month > 11) {
    month = 0;
    year++;
  }
  window.location.href = `/?month=${month}&year=${year}`;
}

//login and signup
let login = document.querySelector(".login-btn");
let signup = document.querySelector(".signup-btn");
let slider = document.querySelector(".slider");
let form_section = document.querySelector(".form-section");
let login_box = document.querySelector(".login-box");
let signup_box = document.querySelector(".signup-box");

signup.addEventListener("click", (e) => {
  if (!signup_box.classList.contains("active-form")) {
    e.preventDefault();
    slider.classList.add("moveSlider");
    form_section.classList.add("form-section-move");
    signup_box.classList.add("active-form");
    login_box.classList.remove("active-form");
  }
});

login.addEventListener("click", (e) => {
  if (!login_box.classList.contains("active-form")) {
    e.preventDefault();
    slider.classList.remove("moveSlider");
    form_section.classList.remove("form-section-move");
    signup_box.classList.remove("active-form");
    login_box.classList.add("active-form");
  }
});
