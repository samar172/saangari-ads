const express = require('express');
const prisma = require('../db');
const router = express.Router();
router.get('/', async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const note = await prisma.note.create({
      data: {
        content: content.trim(),
        userId: req.user.id,
      },
    });
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isDone } = req.body;
    
    // verify ownership
    const existing = await prisma.note.findUnique({ where: { id: Number(id) } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = await prisma.note.update({
      where: { id: Number(id) },
      data: { isDone },
    });
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // verify ownership
    const existing = await prisma.note.findUnique({ where: { id: Number(id) } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'Note not found' });
    }

    await prisma.note.delete({ where: { id: Number(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
