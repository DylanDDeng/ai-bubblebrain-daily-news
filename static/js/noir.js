document.addEventListener("DOMContentLoaded", () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll(".reveal-text").forEach((el) => observer.observe(el));

  const heroImg = document.querySelector(".hero-img");
  if (heroImg) {
    window.addEventListener("scroll", () => {
      const scrollPos = window.scrollY;
      heroImg.style.transform = `scale(${1 + scrollPos * 0.0005}) translateY(${scrollPos * 0.1}px)`;
    });
  }

  const dropdownToggles = document.querySelectorAll(".nav-dropdown-toggle");
  dropdownToggles.forEach((toggle) => {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = toggle.closest(".nav-dropdown");
      const isActive = dropdown.classList.contains("active");
      
      document.querySelectorAll(".nav-dropdown").forEach((d) => d.classList.remove("active"));
      dropdown.classList.toggle("active", !isActive);
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".nav-dropdown").forEach((d) => d.classList.remove("active"));
  });
});
