YardScene renders reducer state immediately. Segment array order maps to the seven
slots in layout.ts. Each epoch (snapshot or reset) cancels all tweens and redraws
statically. Live inspecting pulses and red shakes decorate fence graphics only;
they never change world state or block controls. Actor queues remain ready for M3.
The root route dynamically loads Phaser 3; the dashboard never initializes it.
