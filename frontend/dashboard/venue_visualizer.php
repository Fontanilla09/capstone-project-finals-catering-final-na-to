<?php
session_start();

// Check if customer is logged in
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'customer') {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

$customer_id = $_SESSION['customer_id'];
$query = $conn->prepare("SELECT c.id, c.full_name, u.email
    FROM customers c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?");
$query->bind_param("i", $customer_id);
$query->execute();
$result = $query->get_result();
$customer = $result->fetch_assoc();

$venues = [
    [
        'name' => 'Grand Ballroom',
        'description' => 'A sweeping indoor venue ideal for weddings and large celebrations.',
        'capacity' => 'Up to 250 guests',
        'highlight' => 'Stage-ready, premium lighting, and elegant décor.'
    ],
    [
        'name' => 'Garden Terrace',
        'description' => 'A breezy outdoor space with a lush garden and spacious patio.',
        'capacity' => 'Up to 150 guests',
        'highlight' => 'Perfect for daytime events and evening receptions.'
    ],
    [
        'name' => 'Rooftop Lounge',
        'description' => 'A modern rooftop venue with city views and intimate seating.',
        'capacity' => 'Up to 100 guests',
        'highlight' => 'Best for cocktail parties and private dinners.'
    ],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Venue Visualizer - CaterAI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #0b0b0f;
            color: #f8fafc;
        }

        .header {
            background: #0f172a;
            padding: 22px 32px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .brand h1 {
            color: #f8fafc;
            font-size: 30px;
            font-weight: 800;
        }

        .account {
            display: flex;
            align-items: center;
            gap: 18px;
        }

        .account div {
            text-align: right;
        }

        .account strong {
            display: block;
            font-size: 15px;
            color: #f8fafc;
        }

        .account small {
            display: block;
            color: #94a3b8;
            font-size: 13px;
        }

        .logout-btn {
            border: 1px solid #334155;
            background: #111827;
            color: #f8fafc;
            padding: 10px 18px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.25s ease;
        }

        .logout-btn:hover {
            background: #1f2937;
            border-color: #475569;
        }

        .layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 30px;
            max-width: 1400px;
            margin: 30px auto;
            padding: 0 24px 40px;
        }

        .sidebar {
            background: #111827;
            border-radius: 24px;
            padding: 28px 22px;
            box-shadow: 0 28px 60px rgba(0, 0, 0, 0.35);
            min-height: calc(100vh - 120px);
        }

        .sidebar h2 {
            font-size: 22px;
            color: #f8fafc;
            margin-bottom: 22px;
        }

        .nav-list {
            list-style: none;
            display: grid;
            gap: 10px;
        }

        .nav-list a {
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            padding: 14px 16px;
            border-radius: 18px;
            color: #e2e8f0;
            font-weight: 600;
            background: #111827;
            transition: all 0.25s ease;
        }

        .nav-list a.active,
        .nav-list a:hover {
            background: #1f2937;
            color: #f8fafc;
        }

        .nav-list a .icon {
            width: 34px;
            height: 34px;
            display: inline-grid;
            place-items: center;
            border-radius: 14px;
            background: #1f2937;
            font-size: 18px;
            color: #f8fafc;
        }

        .main {
            display: grid;
            gap: 28px;
        }

        .page-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 18px;
        }

        .page-top h2 {
            font-size: 34px;
            color: #f8fafc;
        }

        .page-top p {
            color: #94a3b8;
            font-size: 15px;
        }

        .card {
            background: #111827;
            border-radius: 28px;
            padding: 28px;
            box-shadow: 0 28px 60px rgba(0, 0, 0, 0.35);
            border: 1px solid #1f2937;
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 22px;
        }

        .card-header h3 {
            font-size: 22px;
            color: #f8fafc;
        }

        .card-header span {
            color: #94a3b8;
            font-size: 14px;
        }

        .upload-layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 24px;
            margin-top: 24px;
        }

        .upload-card {
            background: #111827;
            border-radius: 32px;
            padding: 32px;
            border: 1px solid #1f2937;
            box-shadow: 0 28px 60px rgba(0, 0, 0, 0.35);
        }

        .upload-step {
            display: grid;
            gap: 18px;
        }

        .upload-step h3 {
            font-size: 20px;
            color: #f8fafc;
        }

        .upload-step p {
            color: #94a3b8;
            line-height: 1.7;
        }

        .upload-box {
            display: grid;
            grid-template-columns: 88px 1fr;
            gap: 18px;
            align-items: start;
            padding: 18px;
            background: transparent;
        }

        .upload-preview {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
        }

        .upload-preview img {
            width: 72px;
            height: 72px;
            border-radius: 18px;
            object-fit: cover;
            box-shadow: 0 8px 20px rgba(0,0,0,0.35);
            background: #fff;
            display: block;
        }

        .thumb-caption {
            color: #0f172a;
            font-size: 14px;
            text-align: center;
            max-width: 88px;
            word-wrap: break-word;
            font-weight: 600;
            margin-top: 6px;
            background: transparent;
        }

        .composer-area {
            background: #ffffff;
            border-radius: 20px;
            padding: 20px;
            min-height: 150px;
            color: #0b0b0f;
            display: grid;
            grid-template-rows: 1fr auto;
            box-shadow: 0 14px 40px rgba(2,6,23,0.12);
        }

        .composer-drop {
            border-radius: 12px;
            background: #ffffff;
            border: 1px dashed rgba(15,23,42,0.06);
            display: grid;
            place-items: center;
            min-height: 84px;
            position: relative;
        }

        .composer-plus {
            width: 72px;
            height: 72px;
            border-radius: 16px;
            background: #eef2ff;
            color: #111827;
            display: grid;
            place-items: center;
            font-size: 34px;
            font-weight: 800;
            box-shadow: 0 8px 20px rgba(16,24,40,0.06);
        }

        .composer-drop input[type="file"] {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
        }

        .composer-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-top: 12px;
            font-size: 13px;
            color: #0b0b0f;
        }

        .composer-controls .left { opacity: 0.6 }
        .composer-controls .right { display: flex; gap: 10px; align-items: center }

        .description-box {
            background: #ffffff;
            border-radius: 12px;
            border: 1px solid rgba(15,23,42,0.05);
            padding: 16px;
        }

        .description-box textarea {
            width: 100%;
            border: 1px solid rgba(15,23,42,0.06);
            border-radius: 12px;
            padding: 14px;
            background: #ffffff;
            color: #0b0b0f;
            font-size: 14px;
            min-height: 160px;
            resize: vertical;
        }

        .generate-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 18px;
            border-radius: 20px;
            background: #f8fafc;
            color: #0f172a;
            font-weight: 800;
            border: none;
            cursor: pointer;
            margin-top: 16px;
            transition: transform 0.2s ease, background 0.2s ease;
        }

        .generate-button:hover {
            transform: translateY(-2px);
            background: #e2e8f0;
        }

        /* Centered Gemini-style canvas */
        .center-canvas {
            min-height: 64vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(ellipse at center, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0.0) 45%);
            border-radius: 12px;
            padding: 80px 40px;
        }

        .gemini-wrap {
            width: 100%;
            max-width: 980px;
            text-align: center;
        }

        .hero-title {
            font-size: 36px;
            color: #0b2338;
            margin-bottom: 28px;
            font-weight: 500;
        }

        .gemini-card {
            background: #ffffff;
            border-radius: 28px;
            padding: 18px 22px;
            display: flex;
            align-items: center;
            gap: 18px;
            box-shadow: 0 30px 80px rgba(14,60,120,0.08);
        }

        .app-icon {
            width: 64px;
            height: 64px;
            border-radius: 14px;
            background: #f3f6fb;
            display: grid;
            place-items: center;
            box-shadow: 0 8px 22px rgba(2,6,23,0.06);
        }

        .app-icon img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover }

        .app-meta { text-align: left; }
        .app-meta .title { font-weight: 600; color: #0b2636 }
        .app-meta .sub { color: #64748b; font-size: 13px; margin-top: 6px }

        .input-area { flex: 1; display: flex; align-items: center; gap: 12px }
        .message-input {
            flex: 1;
            border: none;
            outline: none;
            font-size: 16px;
            padding: 16px 18px;
            border-radius: 14px;
            background: transparent;
        }

        .input-controls { display: flex; align-items: center; gap: 12px }
        .chip { background: transparent; color: #0b2338; font-weight: 600 }
        .mic-btn { width: 44px; height: 44px; border-radius: 10px; background: transparent; display: grid; place-items: center; border: none; cursor: pointer }

        .status-row { margin-top: 10px; text-align: right; color: #6b7280; font-size: 13px }

        /* Prompt card styles */
        .prompt-card {
            background: #ffffff;
            border-radius: 18px;
            padding: 18px 20px;
            box-shadow: 0 30px 60px rgba(14,60,120,0.06);
            text-align: left;
        }

        .prompt-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }

        .prompt-body { display:flex; gap:14px; align-items:flex-start }
        .plus-tile { width:56px; height:88px; border-radius:8px; border:1px dashed rgba(15,23,42,0.08); display:grid; place-items:center; color:#6b7280; font-size:26px }

        .prompt-input { flex:1; border:none; outline:none; resize:none; font-size:16px; color:#334155; padding:10px; border-radius:12px; background:transparent }

        .right-actions { display:flex; gap:10px; align-items:center }
        .pill { background:#fff; border:1px solid rgba(15,23,42,0.06); padding:8px 12px; border-radius:20px; cursor:pointer }

        .send-btn { width:44px; height:44px; background:#2b8cf6; color:#fff; border-radius:50%; border:none; cursor:pointer; display:grid; place-items:center; font-size:18px }

        

        @media (max-width: 1080px) {
            .layout {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 720px) {
            .header {
                flex-direction: column;
                gap: 16px;
                align-items: flex-start;
            }

            .layout {
                padding: 0 16px 30px;
            }

            .sidebar {
                padding: 22px 18px;
            }

            .nav-list a {
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">
            <h1>Customer</h1>
        </div>
        <div class="account">
            <div>
                <strong><?php echo htmlspecialchars($customer['full_name']); ?></strong>
                <small><?php echo htmlspecialchars($customer['email']); ?></small>
            </div>
            <form method="POST" action="../logout.php" style="margin: 0;">
                <button type="submit" class="logout-btn">Logout</button>
            </form>
        </div>
    </div>

    <div class="layout">
        <aside class="sidebar">
            <h2>Navigation</h2>
            <nav>
                <ul class="nav-list">
                    <li><a href="customer.php"><span class="icon">🏠</span>Dashboard</a></li>
                    <li><a href="#"><span class="icon">💬</span>Messages</a></li>
                    <li><a href="#"><span class="icon">👁️</span>Browse Package</a></li>
                    <li><a class="active" href="venue_visualizer.php"><span class="icon">🎯</span>Venue Visualizer</a></li>
                    <li><a href="#"><span class="icon">⚙️</span>Settings</a></li>
                    <li><a href="../logout.php"><span class="icon">↩️</span>Log Out</a></li>
                </ul>
            </nav>
        </aside>

        <main class="main">
            <div class="center-canvas">
                <div class="gemini-wrap">
                    <div class="hero-title">Where should we start?</div>

                    <div class="prompt-card" role="region" aria-label="Prompt">
                        <div class="prompt-top"></div>

                        <div class="prompt-body">
                            <div id="plus-tile" class="plus-tile" title="Add image">+</div>
                            <input type="file" id="prompt-file-input" accept="image/*" style="display:none">
                            <textarea id="prompt-input" class="prompt-input" placeholder="Enter prompt here" rows="3"></textarea>
                            <div class="right-actions">
                                <button id="send-btn" class="send-btn">⬆</button>
                            </div>
                        </div>

                        
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Prompt card interactions
        const promptInput = document.getElementById('prompt-input');
        const sendBtn = document.getElementById('send-btn');
        const plusTile = document.getElementById('plus-tile');
        const fileInput = document.getElementById('prompt-file-input');

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendPrompt();
            }
        });

        sendBtn.addEventListener('click', sendPrompt);

        plusTile.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            // preview in plus tile: set background-image
            const reader = new FileReader();
            reader.onload = function(e) {
                plusTile.style.backgroundImage = `url('${e.target.result}')`;
                plusTile.style.backgroundSize = 'cover';
                plusTile.style.color = 'transparent';
                // upload to server
                uploadImage(file);
            };
            reader.readAsDataURL(file);
        });

        function clearSelectedImage() {
            plusTile.style.backgroundImage = '';
            plusTile.style.color = '#6b7280';
            fileInput.value = '';
        }

        async function sendPrompt() {
            const v = promptInput.value.trim();
            if (!v) return;
            sendBtn.disabled = true;
            sendBtn.style.transform = 'translateY(-6px)';

            const fd = new FormData();
            fd.append('prompt', v);
            if (fileInput.files && fileInput.files[0]) fd.append('image', fileInput.files[0]);

            try {
                const res = await fetch('../../backend/generate.php', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.success && data.url) {
                    // show generated image in preview-canvas
                    const preview = document.getElementById('preview-image');
                    preview.src = data.url;
                    preview.style.display = 'block';
                    document.querySelector('.preview-placeholder').style.display = 'none';
                } else {
                    showToast('Generation failed: ' + (data.error || JSON.stringify(data)));
                }
            } catch (err) {
                console.error(err);
                showToast('Upload/generation error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.style.transform = '';
            }
        }

        // Upload image to backend endpoint
        function uploadImage(file) {
            const fd = new FormData();
            fd.append('image', file);
            fetch('../../backend/upload_image.php', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(data => {
                    if (data && data.success) {
                        console.log('Uploaded:', data.url);
                    } else {
                        showToast('Upload failed');
                        clearSelectedImage();
                    }
                }).catch(err => {
                    console.error(err);
                    showToast('Upload error');
                    clearSelectedImage();
                });
        }

        // Simple in-page toast for non-blocking messages
        function showToast(message, timeout=4000) {
            let t = document.getElementById('vv-toast');
            if (!t) return console.log('Toast:', message);
            t.textContent = message;
            t.style.opacity = '1';
            t.style.transform = 'translateY(0)';
            clearTimeout(t._hideTimeout);
            t._hideTimeout = setTimeout(() => {
                t.style.opacity = '0';
                t.style.transform = 'translateY(10px)';
            }, timeout);
        }
    </script>
</body>
<div id="vv-toast" style="position:fixed;left:50%;transform:translateX(-50%) translateY(10px);bottom:24px;background:rgba(0,0,0,0.8);color:#fff;padding:10px 16px;border-radius:8px;opacity:0;transition:opacity .25s,transform .25s;z-index:9999;pointer-events:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;"></div>
</html>
</html>
