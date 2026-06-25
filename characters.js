// The Office (US) cast roster — used by the "That's what she said" question type
// (show a line, pick who said it). Each person has an emoji `face` as a seeded
// stand-in; drop a transparent-background cutout into brand/cast/<id>.png and set
// `img` and it renders instead — the thick white sticker outline (style.css
// .cface) is applied either way, so cutouts read like peel-off stickers.
window.CAST = (function () {
  // Most leads have a real cutout sticker (brand/cast/<id>.png — background
  // removed, baked white outline). The rest fall back to an emoji face.
  var people = {
    michael:  { name: "Michael",  face: "🧑‍💼", img: "brand/cast/michael.png" },
    jim:      { name: "Jim",      face: "😏", img: "brand/cast/jim.png" },
    pam:      { name: "Pam",      face: "🎨", img: "brand/cast/pam.png" },
    dwight:   { name: "Dwight",   face: "🥋", img: "brand/cast/dwight.png" },
    andy:     { name: "Andy",     face: "🎸" },
    kevin:    { name: "Kevin",    face: "🍪", img: "brand/cast/kevin.png" },
    angela:   { name: "Angela",   face: "🐱", img: "brand/cast/angela.png" },
    oscar:    { name: "Oscar",    face: "🤵" },
    stanley:  { name: "Stanley",  face: "😑", img: "brand/cast/stanley.png" },
    phyllis:  { name: "Phyllis",  face: "🧶", img: "brand/cast/phyllis.png" },
    creed:    { name: "Creed",    face: "🧟" },
    ryan:     { name: "Ryan",     face: "📱", img: "brand/cast/ryan.png" },
    kelly:    { name: "Kelly",    face: "💅", img: "brand/cast/kelly.png" },
    toby:     { name: "Toby",     face: "😔", img: "brand/cast/toby.png" },
    holly:    { name: "Holly",    face: "🥰" },
    meredith: { name: "Meredith", face: "🍷", img: "brand/cast/meredith.png" },
    darryl:   { name: "Darryl",   face: "📦", img: "brand/cast/darryl.png" },
    jan:      { name: "Jan",      face: "💼", img: "brand/cast/jan.png" },
    erin:     { name: "Erin",     face: "😊" },
    roy:      { name: "Roy",      face: "🔧", img: "brand/cast/roy.png" },
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
