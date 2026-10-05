GATE 2027 DASHBOARD - ONE CLICK
==============================

1. Install Node.js LTS.
2. Copy .env.local.example to .env.local.
3. Edit .env.local and set DATA_DIR to the folder containing your existing
   local.db / PDFs / screenshots / backups. The folder must already exist.
4. Double-click Start-GATE-2027-Dashboard.bat.
5. First run installs dependencies automatically and opens:
   http://127.0.0.1:3000

CLASS / DPP SYNC FIX
--------------------
The sync engine now recognizes common folder names including:
- Class
- Class Video
- Class Videos
- Class Lecture / Class Lectures
- DPP
- DPP Video
- DPP Videos
- DPP Lecture / DPP Lectures
and underscore/dash variants such as Class_Videos and DPP-Videos.

Chapter matching also treats '&' and 'and' as equivalent, so
"Structure & Union" and "Structure and Union" can match during a chapter sync.

After Sync Library, the Class & DPP page reports the number of Class and DPP
videos actually discovered.
