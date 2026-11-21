(function () {
  var cmd = document.getElementById("cmd");
  var platformSlot = document.getElementById("cmd-platform");
  var copyButton = document.getElementById("copy");
  var status = document.getElementById("copy-status");
  var resetTimer;

  // Swap the --platform value when a tool is picked.
  document.querySelectorAll('input[name="platform"]').forEach(function (input) {
    input.addEventListener("change", function () {
      if (input.checked) {
        platformSlot.textContent = input.value;
        resetCopyButton();
        status.textContent = "";
      }
    });
  });

  function resetCopyButton() {
    clearTimeout(resetTimer);
    copyButton.textContent = "Copy command";
    copyButton.classList.remove("is-done");
  }

  function showCopied() {
    copyButton.textContent = "Copied";
    copyButton.classList.add("is-done");
    status.textContent = "Command copied. Paste it into a terminal in your project folder.";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(resetCopyButton, 2500);
  }

  function selectCommand() {
    var range = document.createRange();
    range.selectNodeContents(cmd);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(area);
    copyButton.focus();
    return ok;
  }

  function showManual() {
    selectCommand();
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    status.textContent = "Copy is blocked here. The command is selected: press " +
      (mac ? "Command+C" : "Ctrl+C") + " to copy it.";
  }

  copyButton.addEventListener("click", function () {
    var text = cmd.textContent.trim();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(showCopied, function () {
        if (legacyCopy(text)) { showCopied(); } else { showManual(); }
      });
    } else if (legacyCopy(text)) {
      showCopied();
    } else {
      showManual();
    }
  });
})();
