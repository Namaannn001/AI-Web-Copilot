Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\Naman\.gemini\antigravity\brain\8c2ee028-8430-4eb8-ae64-ce06dc2c6959\extension_icon_1774530760156.png"
$img = [System.Drawing.Image]::FromFile($srcPath)

foreach ($size in @(16, 48, 128)) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    $outPath = "D:\smart web assistant\extension\icons\icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $outPath"
}

$img.Dispose()
Write-Host "All icons created!"
