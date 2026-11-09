(function () {
  var input = document.getElementById("filtre-communes");
  var table = document.getElementById("table-communes");
  var statut = document.getElementById("filtre-communes-statut");
  if (!input || !table) return;
  var rows = table.querySelectorAll("tbody tr");
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function filtrer() {
    var q = norm(input.value.trim());
    var n = 0;
    rows.forEach(function (tr) {
      var ok = !q || norm(tr.textContent).indexOf(q) !== -1;
      tr.hidden = !ok;
      if (ok) n += 1;
    });
    if (statut) {
      if (!q) statut.textContent = "";
      else if (n === 0) statut.textContent = "Aucune commune ne correspond.";
      else statut.textContent = n + (n > 1 ? " communes" : " commune") + " sur " + rows.length;
    }
  }
  input.addEventListener("input", filtrer);
})();
