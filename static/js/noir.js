document.addEventListener("DOMContentLoaded", () => {
  const dot = document.querySelector(".cursor-dot");
  const outline = document.querySelector(".cursor-outline");

  if (dot && outline) {
    window.addEventListener("mousemove", (e) => {
      const posX = e.clientX;
      const posY = e.clientY;

      dot.style.left = `${posX}px`;
      dot.style.top = `${posY}px`;

      outline.animate(
        { left: `${posX}px`, top: `${posY}px` },
        { duration: 500, fill: "forwards" }
      );
    });

    document.querySelectorAll("a, .card, .nav-logo").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        outline.style.width = "80px";
        outline.style.height = "80px";
        outline.style.backgroundColor = "rgba(255,255,255,0.08)";
      });
      el.addEventListener("mouseleave", () => {
        outline.style.width = "40px";
        outline.style.height = "40px";
        outline.style.backgroundColor = "transparent";
      });
    });
  }

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
});
