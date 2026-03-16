document.addEventListener("DOMContentLoaded", () => {
    const cards = document.querySelectorAll('.card');
    let selectedCard = null;

    // Event listener for card click
    cards.forEach(card => {
        card.addEventListener("click", () => {
            if (selectedCard) {
                selectedCard.classList.remove("selected");
            }

            card.classList.add("selected");
            selectedCard = card;

            document.querySelector('input[name="passName"]').value = card.querySelector('input[name="passName"]').value;
            document.querySelector('input[name="passId"]').value = card.querySelector('input[name="passId"]').value;
            document.querySelector('input[name="passImage"]').value = card.querySelector('input[name="passImage"]').value;
            document.querySelector('input[name="passPrice"]').value = card.querySelector('input[name="passPrice"]').value;

            document.getElementById("btnOk").style.display = "block";
        });
    });

    // Event listener for form submission
    document.getElementById('gamePassForm').addEventListener('submit', function () {
        document.getElementById('btnOk').disabled = true;
    });
});