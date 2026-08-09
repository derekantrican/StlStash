// File types that make a group of companion files an actual 3D "model" for the flat
// All Models view. Things like .gcode, .jpg, .csv, .pdf are often stored alongside a model
// (renders, slicer output, instructions) but shouldn't surface as their own model card.
const MODEL_EXTENSIONS = ["stl", "3mf", "obj", "step", "stp", "sldprt", "f3d", "scad"];

module.exports = { MODEL_EXTENSIONS };
