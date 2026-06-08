'use strict';

/**
 * pict-section-moodboard entry point.
 *
 * Exports the Moodboard view (with its default_configuration) plus the two card classes and the
 * note palette, so a host can register the view and, if it wants, reuse or subclass the cards.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libMoodboardView = require('./views/PictView-Moodboard.js');

module.exports = libMoodboardView;
module.exports.default_configuration = libMoodboardView.default_configuration;
module.exports.MoodImageCard = require('./cards/MoodImage-Card.js');
module.exports.MoodNoteCard = require('./cards/MoodNote-Card.js');
module.exports.MoodTextCard = require('./cards/MoodText-Card.js');
module.exports.ImageSource = require('./sources/ImageSource-Base.js');
module.exports.NOTE_COLORS = libMoodboardView.NOTE_COLORS;
