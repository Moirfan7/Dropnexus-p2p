# Create DropNexus Icon Generator Script
Add-Type -AssemblyName System.Drawing

function Create-DropNexusIcon {
    param (
        [string]$OutputPath,
        [string]$PngPath
    )

    $assetsDir = Split-Path $OutputPath -Parent
    if (-not (Test-Path $assetsDir)) {
        New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
    }

    $sizes = @(256, 128, 64, 48, 32, 16)
    $pngStreams = @()

    foreach ($size in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        $scale = $size / 256.0
        $margin = [Math]::Max(4 * $scale, 2.0)
        $rectW = $size - (2 * $margin)
        $rectH = $size - (2 * $margin)
        $radius = 48 * $scale

        # Create rounded rect path for background
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = $radius * 2
        $path.AddArc($margin, $margin, $d, $d, 180, 90)
        $path.AddArc($margin + $rectW - $d, $margin, $d, $d, 270, 90)
        $path.AddArc($margin + $rectW - $d, $margin + $rectH - $d, $d, $d, 0, 90)
        $path.AddArc($margin, $margin + $rectH - $d, $d, $d, 90, 90)
        $path.CloseFigure()

        # Background Gradient: Rich Indigo (#4338ca) to Electric Purple (#7e22ce)
        $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.PointF(0, 0)),
            (New-Object System.Drawing.PointF($size, $size)),
            [System.Drawing.Color]::FromArgb(255, 67, 56, 202),
            [System.Drawing.Color]::FromArgb(255, 126, 34, 206)
        )
        $g.FillPath($gradBrush, $path)

        # Subtle Glowing Border
        $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 165, 180, 252), [Math]::Max(2 * $scale, 1.0))
        $g.DrawPath($borderPen, $path)

        # Draw Orbiting Signal Waves / Nexus Nodes
        $cyanGlowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 56, 189, 248), [Math]::Max(3 * $scale, 1.5))
        $ringRect1 = New-Object System.Drawing.RectangleF(40 * $scale, 40 * $scale, 176 * $scale, 176 * $scale)
        $g.DrawArc($cyanGlowPen, $ringRect1, 200, 140)

        $emeraldGlowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(140, 52, 211, 153), [Math]::Max(2.5 * $scale, 1.0))
        $ringRect2 = New-Object System.Drawing.RectangleF(55 * $scale, 55 * $scale, 146 * $scale, 146 * $scale)
        $g.DrawArc($emeraldGlowPen, $ringRect2, 30, 120)

        # Glowing Node Dots
        $dotBrushCyan = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 56, 189, 248))
        $dotBrushEmerald = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 52, 211, 153))
        $dotR = 5 * $scale
        $g.FillEllipse($dotBrushCyan, (185 * $scale), (65 * $scale), $dotR * 2, $dotR * 2)
        $g.FillEllipse($dotBrushEmerald, (65 * $scale), (185 * $scale), $dotR * 2, $dotR * 2)

        # Draw Futuristic Paper Plane (Core Nexus Symbol)
        $pTip   = New-Object System.Drawing.PointF(195 * $scale, 60 * $scale)
        $pLeft  = New-Object System.Drawing.PointF(60 * $scale, 135 * $scale)
        $pNotch = New-Object System.Drawing.PointF(125 * $scale, 135 * $scale)
        $pRight = New-Object System.Drawing.PointF(135 * $scale, 195 * $scale)

        # Left Wing Path
        $leftWing = New-Object System.Drawing.Drawing2D.GraphicsPath
        $leftWing.AddPolygon(@($pTip, $pLeft, $pNotch))
        $leftBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
        $g.FillPath($leftBrush, $leftWing)

        # Right Wing Path (Slightly shaded for 3D depth)
        $rightWing = New-Object System.Drawing.Drawing2D.GraphicsPath
        $rightWing.AddPolygon(@($pTip, $pNotch, $pRight))
        $rightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
        $g.FillPath($rightBrush, $rightWing)

        # Center Spine / Keel Highlight (Electric Cyan Glow)
        $spinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), [Math]::Max(2 * $scale, 1.0))
        $g.DrawLine($spinePen, $pTip, $pNotch)

        # Save 256x256 PNG as the master preview icon
        if ($size -eq 256 -and $PngPath) {
            $bmp.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }

        # Save to memory stream as PNG for ICO embedding
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngStreams += @{
            Size = $size
            Data = $ms.ToArray()
        }

        $g.Dispose()
        $bmp.Dispose()
        $ms.Dispose()
    }

    # Construct Windows Multi-Resolution ICO File
    $fs = New-Object System.IO.FileStream($OutputPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR Header (6 bytes)
    $bw.Write([uint16]0)                 # Reserved (0)
    $bw.Write([uint16]1)                 # Type (1 = ICO)
    $bw.Write([uint16]$pngStreams.Count) # Number of images

    # Calculate offset of image data
    # Header is 6 bytes, each ICONDIRENTRY is 16 bytes
    $offset = 6 + (16 * $pngStreams.Count)

    # Write ICONDIRENTRY for each size
    foreach ($img in $pngStreams) {
        $w = if ($img.Size -ge 256) { [byte]0 } else { [byte]$img.Size }
        $h = if ($img.Size -ge 256) { [byte]0 } else { [byte]$img.Size }

        $bw.Write([byte]$w)                  # Width
        $bw.Write([byte]$h)                  # Height
        $bw.Write([byte]0)                   # Color count (0 = >=8bpp)
        $bw.Write([byte]0)                   # Reserved (0)
        $bw.Write([uint16]1)                 # Color planes (1)
        $bw.Write([uint16]32)                # Bits per pixel (32)
        $bw.Write([uint32]$img.Data.Length)  # Image size in bytes
        $bw.Write([uint32]$offset)           # File offset of image data

        $offset += $img.Data.Length
    }

    # Write Image Data (PNG blocks)
    foreach ($img in $pngStreams) {
        $bw.Write($img.Data)
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()

    Write-Host "Generated Windows ICO icon: $OutputPath"
    if ($PngPath) {
        Write-Host "Generated Master PNG: $PngPath"
    }
}

$root = "c:\Users\mi567\OneDrive\Desktop\p2p-file-share"
Create-DropNexusIcon -OutputPath "$root\assets\dropnexus.ico" -PngPath "$root\assets\dropnexus.png"
Copy-Item "$root\assets\dropnexus.ico" "$root\public\favicon.ico" -Force
Write-Host "Copied branded favicon to public/favicon.ico"
