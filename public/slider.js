let gamecard = document.querySelectorAll(`.slider .gamecard`);
let next = document.getElementById("next");
let prev = document.getElementById("prev");

let active = 1; 

function loadShow(){
    let stt = 0;
    gamecard[active].style.transform = `none`;
    gamecard[active].style.zIndex =  1;
    gamecard[active].style.filter = `none`;
    gamecard[active].style.opacity = 1;

    for (var i = active + 1; i < gamecard.length; i++) {
        stt++;
        gamecard[i].style.transform = `translateX(${120 * stt}px) scale(${1 - 0.2 * stt}) perspective(16px) rotateY(-1deg)`;
        gamecard[i].style.zIndex = -stt;
        gamecard[i].style.filter = `blur(5px)`;
        gamecard[i].style.opacity = stt > 2 ? 0 : 0.6;
    }

    stt = 0;

    for (var i = active - 1; i >= 0; i--) {
        stt++;
        gamecard[i].style.transform = `translateX(${-120 * stt}px) scale(${1 - 0.2 * stt}) perspective(16px) rotateY(-1deg)`;
        gamecard[i].style.zIndex = -stt;
        gamecard[i].style.filter = `blur(5px)`;
        gamecard[i].style.opacity = stt > 2 ? 0 : 0.6;
    }
}

loadShow();

next.onclick = function() {
    active = active + 1 < gamecard.length ? active + 1 : active;
    loadShow();  
}
prev.onclick = function(){
    active = active -1 >= 0 ? active  - 1 : active;
    loadShow()
}