/* /js/main.js */
const observerOptions = {
    root: null, 
    // This tells the observer: "Start detecting 200px down from the top"
    // Adjust -200px to match your total Header + Nav height
    rootMargin: '-200px 0px -50% 0px', 
    threshold: 0
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
