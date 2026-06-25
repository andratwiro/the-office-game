// The Office (US) cast roster — used by the "That's what she said" question type
// (show a line, pick who said it). Each person has an emoji `face` as a seeded
// stand-in; drop a transparent-background cutout into brand/cast/<id>.png and set
// `img` and it renders instead — the thick white sticker outline (style.css
// .cface) is applied either way, so cutouts read like peel-off stickers.
window.CAST = (function () {
  var people = {
    michael:  { name: "Michael",  face: "🧑‍💼" },
    jim:      { name: "Jim",      face: "😏" },
    pam:      { name: "Pam",      face: "🎨" },
    dwight:   { name: "Dwight",   face: "🥋" },
    andy:     { name: "Andy",     face: "🎸" },
    kevin:    { name: "Kevin",    face: "🍪" },
    angela:   { name: "Angela",   face: "🐱" },
    oscar:    { name: "Oscar",    face: "🤵" },
    stanley:  { name: "Stanley",  face: "😑" },
    phyllis:  { name: "Phyllis",  face: "🧶" },
    creed:    { name: "Creed",    face: "🧟" },
    ryan:     { name: "Ryan",     face: "📱" },
    kelly:    { name: "Kelly",    face: "💅" },
    toby:     { name: "Toby",     face: "😔" },
    holly:    { name: "Holly",    face: "🥰" },
    meredith: { name: "Meredith", face: "🍷" },
    darryl:   { name: "Darryl",   face: "📦" },
    jan:      { name: "Jan",      face: "💼" },
    erin:     { name: "Erin",     face: "😊" },
    roy:      { name: "Roy",      face: "🔧" },
    robert:   { name: "Robert",   face: "🦅" },
    nellie:   { name: "Nellie",   face: "🫖" },
    gabe:     { name: "Gabe",     face: "😬" }
  };

  function get(id) { return people[id] || null; }
  function name(id) { var p = people[id]; return p ? p.name : id; }
  function face(id) { var p = people[id]; return p ? p.face : "🙂"; }
  function img(id) { var p = people[id]; return (p && p.img) || ""; }
  function list() {
    return Object.keys(people).map(function (id) {
      return { id: id, name: people[id].name, face: people[id].face, img: people[id].img || "" };
    });
  }
  // Inner markup for one face — an <img> cutout if seeded, else the emoji glyph.
  // Caller wraps it; the .cface class carries the white outline.
  function faceHTML(id, esc) {
    esc = esc || function (s) { return s; };
    var p = people[id] || { name: id, face: "🙂" };
    return p.img
      ? '<img class="cface" src="' + esc(p.img) + '" alt="">'
      : '<span class="cface glyph">' + esc(p.face || "🙂") + '</span>';
  }

  return { people: people, get: get, name: name, face: face, img: img, list: list, faceHTML: faceHTML };
})();
