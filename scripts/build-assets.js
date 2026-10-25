const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

console.log('[DropNexus] Generating high-resolution Windows ICO and PNG icons...');

const psScript = `
Add-Type -AssemblyName System.Drawing

$assetsDir = "${assetsDir.replace(/\\/g, '\\\\')}"
$publicDir = "${publicDir.replace(/\\/g, '\\\\')}"
$icoPath = Join-Path $assetsDir "dropnexus.ico"
$pngPath = Join-Path $assetsDir "dropnexus.png"
$faviconPath = Join-Path $publicDir "favicon.ico"

$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()

foreach ($sz in $sizes) {
    [float]$size = $sz
    $bmp = New-Object System.Drawing.Bitmap([int]$size, [int]$size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    [float]$scale = $size / 256.0
    [float]$margin = [Math]::Max([float](4.0 * $scale), [float]1.5)
    [float]$rectW = $size - (2.0 * $margin)
    [float]$rectH = $size - (2.0 * $margin)
    [float]$radius = 48.0 * $scale
    [float]$d = $radius * 2.0

    # Background Squircle Path
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($margin, $margin, $d, $d, [float]180.0, [float]90.0)
    $path.AddArc($margin + $rectW - $d, $margin, $d, $d, [float]270.0, [float]90.0)
    $path.AddArc($margin + $rectW - $d, $margin + $rectH - $d, $d, $d, [float]0.0, [float]90.0)
    $path.AddArc($margin, $margin + $rectH - $d, $d, $d, [float]90.0, [float]90.0)
    $path.CloseFigure()

    # Dark Indigo to Radiant Violet Gradient
    $pt1 = New-Object System.Drawing.PointF([float]0.0, [float]0.0)
    $pt2 = New-Object System.Drawing.PointF($size, $size)
    $c1 = [System.Drawing.Color]::FromArgb(255, 67, 56, 202)
    $c2 = [System.Drawing.Color]::FromArgb(255, 126, 34, 206)
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($pt1, $pt2, $c1, $c2)
    $g.FillPath($gradBrush, $path)

    # Glowing Violet Border
    $cBorder = [System.Drawing.Color]::FromArgb(180, 165, 180, 252)
    $borderPen = New-Object System.Drawing.Pen($cBorder, [Math]::Max([float](2.0 * $scale), [float]1.0))
    $g.DrawPath($borderPen, $path)

    # Orbital Nexus Data Ring
    $cCyan = [System.Drawing.Color]::FromArgb(160, 56, 189, 248)
    $cyanGlowPen = New-Object System.Drawing.Pen($cCyan, [Math]::Max([float](3.0 * $scale), [float]1.5))
    $g.DrawArc($cyanGlowPen, [float](40.0 * $scale), [float](40.0 * $scale), [float](176.0 * $scale), [float](176.0 * $scale), [float]200.0, [float]140.0)

    $cEmerald = [System.Drawing.Color]::FromArgb(160, 52, 211, 153)
    $emeraldGlowPen = New-Object System.Drawing.Pen($cEmerald, [Math]::Max([float](2.5 * $scale), [float]1.2))
    $g.DrawArc($emeraldGlowPen, [float](55.0 * $scale), [float](55.0 * $scale), [float](146.0 * $scale), [float](146.0 * $scale), [float]30.0, [float]120.0)

    # Node Connection Dots
    $dotBrushCyan = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 56, 189, 248))
    $dotBrushEmerald = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))
    [float]$dotD = [Math]::Max([float](10.0 * $scale), [float]3.0)
    $g.FillEllipse($dotBrushCyan, [float](185.0 * $scale), [float](65.0 * $scale), $dotD, $dotD)
    $g.FillEllipse($dotBrushEmerald, [float](62.0 * $scale), [float](185.0 * $scale), $dotD, $dotD)

    # Modern Supersonic Paper Plane
    $pTip   = New-Object System.Drawing.PointF([float](195.0 * $scale), [float](60.0 * $scale))
    $pLeft  = New-Object System.Drawing.PointF([float](60.0 * $scale), [float](135.0 * $scale))
    $pNotch = New-Object System.Drawing.PointF([float](125.0 * $scale), [float](135.0 * $scale))
    $pRight = New-Object System.Drawing.PointF([float](135.0 * $scale), [float](195.0 * $scale))

    # Left Wing (Pure White)
    $leftPts = [System.Drawing.PointF[]]@($pTip, $pLeft, $pNotch)
    $leftWing = New-Object System.Drawing.Drawing2D.GraphicsPath
    $leftWing.AddPolygon($leftPts)
    $leftBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.FillPath($leftBrush, $leftWing)

    # Right Wing (Subtly shaded light silver-slate for 3D depth)
    $rightPts = [System.Drawing.PointF[]]@($pTip, $pNotch, $pRight)
    $rightWing = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rightWing.AddPolygon($rightPts)
    $rightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
    $g.FillPath($rightBrush, $rightWing)

    # Spine Center Glow Line
    $spinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), [Math]::Max([float](2.2 * $scale), [float]1.0))
    $g.DrawLine($spinePen, $pTip, $pNotch)

    if ($sz -eq 256) {
        $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngStreams += @{
        Size = $sz
        Data = $ms.ToArray()
    }

    $g.Dispose()
    $bmp.Dispose()
    $ms.Dispose()
}

$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$pngStreams.Count)

$offset = 6 + (16 * $pngStreams.Count)
foreach ($img in $pngStreams) {
    $w = if ($img.Size -ge 256) { [byte]0 } else { [byte]$img.Size }
    $h = if ($img.Size -ge 256) { [byte]0 } else { [byte]$img.Size }
    $bw.Write([byte]$w)
    $bw.Write([byte]$h)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$img.Data.Length)
    $bw.Write([uint32]$offset)
    $offset += $img.Data.Length
}

foreach ($img in $pngStreams) {
    $bw.Write($img.Data)
}

$bw.Flush()
$bw.Close()
$fs.Close()

Copy-Item $icoPath $faviconPath -Force
Write-Host "SUCCESS: Generated DropNexus ICO, PNG and favicon cleanly!"
`;

try {
    const output = execSync('powershell -ExecutionPolicy Bypass -Command -', {
        input: psScript,
        encoding: 'utf-8'
    });
    console.log(output.trim());
} catch (err) {
    console.error('Error generating icon:', err.message);
    process.exit(1);
}
