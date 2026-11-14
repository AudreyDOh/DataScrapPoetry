const suggestions = document.getElementById('source-suggestions');
const sourceUrl = document.getElementById('source-url');

suggestions.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !suggestions.contains(button) || sourceUrl.disabled) return;
  const link = button.closest('li').querySelector('a');

  // Selecting a suggestion only edits the unsaved URL field. It must not
  // load/import content, reset the editor, or send a workshop API request.
  sourceUrl.value = link.href;
  sourceUrl.setCustomValidity('');
  suggestions.open = false;
  sourceUrl.focus({preventScroll: true});
});
