/* /js/main.js */
const observerOptions = {
    root: null,
    threshold: 0.3
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            document.querySelectorAll('.anchor-link').forEach(link => {
                link.classList.remove('active');
            });
            const activeLink = document.querySelector(`.anchor-link[href="#${entry.target.id}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    });
}, observerOptions);

document.querySelectorAll('section, h2[id]').forEach(section => {
    observer.observe(section);
});
