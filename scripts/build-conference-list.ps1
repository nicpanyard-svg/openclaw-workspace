# Build Conference List Excel with monthly tabs
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Add()

# Remove default sheets later
# Data: Month, Show Name, Dates, Location, Vertical, Expo Pass Cost, Attendees, Notes/URL
$conferences = @(
    # ── 2025 (remaining) ──
    [pscustomobject]@{Month="Sep 2025"; Name="Shale Insight 2025"; Dates="Sep 16-19, 2025"; Location="Erie, PA"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Marcellus Shale Coalition; shaleinsight.com"},
    [pscustomobject]@{Month="Sep 2025"; Name="GPA Midstream Annual Convention"; Dates="Sep 21-24, 2025"; Location="San Antonio, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees="1,800+"; Notes="gpamidstream.org"},
    [pscustomobject]@{Month="Sep 2025"; Name="Methane Mitigation Summit Canada"; Dates="Sep 23-25, 2025"; Location="Calgary, AB"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Industrial Decarbonization Network"},
    [pscustomobject]@{Month="Oct 2025"; Name="SPE ATCE – Annual Technical Conference & Exhibit"; Dates="Oct 6-8, 2025"; Location="Dallas, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="spe.org/atce"},
    [pscustomobject]@{Month="Oct 2025"; Name="NMOGA Annual Meeting & Exhibition"; Dates="Oct 7-8, 2025"; Location="Santa Fe, NM"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="nmoga.org"},
    [pscustomobject]@{Month="Oct 2025"; Name="Oil & Natural Gas Expo"; Dates="Oct 9, 2025"; Location="Oklahoma City, OK"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="One-day expo"},
    [pscustomobject]@{Month="Oct 2025"; Name="Retail Supply Chain & Logistics Expo 2025"; Dates="Oct 15-16, 2025"; Location="Las Vegas, NV"; Vertical="Retail"; ExpoCost="TBD"; Attendees=""; Notes="retailscl.com"},
    [pscustomobject]@{Month="Oct 2025"; Name="East Texas Gas Producers Association Meeting"; Dates="Oct 16, 2025"; Location="Longview, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Nov 2025"; Name="Disasters Expo USA"; Dates="Nov 5-6, 2025"; Location="Houston, TX"; Vertical="General"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Nov 2025"; Name="Annual Midstream Council Meeting (OOGA)"; Dates="Nov 12, 2025"; Location="Columbus, OH"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Ohio Oil & Gas Association"},
    [pscustomobject]@{Month="Dec 2025"; Name="9th Midstream Oil & Gas Law Conference"; Dates="Dec 9, 2025"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="`$495 regular / `$440 member"; Attendees=""; Notes="cailaw.org; early reg deadline Nov 20"},
    [pscustomobject]@{Month="Dec 2025"; Name="Rocky Mountain Pipeliners Club Holiday Party"; Dates="Dec 5, 2025"; Location="Denver, CO"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Networking event"},
    [pscustomobject]@{Month="Dec 2025"; Name="San Antonio Pipeliners Association Luncheon"; Dates="Dec 11, 2025"; Location="San Antonio, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Networking event"},

    # ── 2026 ──
    [pscustomobject]@{Month="Jan 2026"; Name="NRF 2026: Retail's Big Show"; Dates="Jan 11-13, 2026"; Location="New York, NY"; Vertical="Retail"; ExpoCost="Retailers ~`$100 / Non-retail `$2,000-`$3,500"; Attendees="40,000+"; Notes="nrf.com — biggest retail show in the world"},
    [pscustomobject]@{Month="Feb 2026"; Name="RILA LINK 2026 – Retail Supply Chain Conference"; Dates="Feb 1-4, 2026"; Location="Orlando, FL"; Vertical="Retail"; ExpoCost="Complimentary for qualifying retailers"; Attendees=""; Notes="rila.org; logistics, fulfillment, AI, automation"},
    [pscustomobject]@{Month="Mar 2026"; Name="Houston GPA Midstream Training Session"; Dates="Mar 4, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="gpamidstream.org"},
    [pscustomobject]@{Month="Mar 2026"; Name="World Hydrogen & Carbon Americas"; Dates="Mar 10-12, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Hydrogen/carbon capture focus"},
    [pscustomobject]@{Month="Mar 2026"; Name="AMPP Annual Conference + Expo"; Dates="Mar 15-19, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="ampp.org; pipeline corrosion/integrity"},
    [pscustomobject]@{Month="Mar 2026"; Name="CERAWeek 2026"; Dates="Mar 23-27, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD (premium event)"; Attendees="5,000+"; Notes="ceraweek.com — 'Davos of Energy'"},
    [pscustomobject]@{Month="Mar 2026"; Name="Louisiana Gas Association GASTEC Expo Day"; Dates="Mar 24, 2026"; Location="Zachary, LA"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Mar 2026"; Name="Shoptalk Spring 2026"; Dates="Mar 24-26, 2026"; Location="Las Vegas, NV"; Vertical="Retail"; ExpoCost="Retailers free–`$1,250 / General `$3,545"; Attendees="8,000+"; Notes="shoptalk.com"},
    [pscustomobject]@{Month="Mar 2026"; Name="WTX Oil and Gas Convention"; Dates="Mar 25-26, 2026"; Location="Midland, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Permian Basin focus"},
    [pscustomobject]@{Month="Mar 2026"; Name="Carbon Capture Utilization & Storage (CCUS 2026)"; Dates="Mar 30 – Apr 1, 2026"; Location="The Woodlands, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Apr 2026"; Name="Energy Workforce & Technology Council Annual Meeting"; Dates="Mar 31 – Apr 1, 2026"; Location="Tucson, AZ"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Apr 2026"; Name="Oklahoma Excavation Safety Expo"; Dates="Apr 1-2, 2026"; Location="Oklahoma City, OK"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Pipeline/utility safety"},
    [pscustomobject]@{Month="Apr 2026"; Name="Permian Basin Water In Energy Conference"; Dates="Apr 7-9, 2026"; Location="Midland, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Apr 2026"; Name="PA Independent Oil & Gas Assoc. Spring Meeting"; Dates="Apr 8-9, 2026"; Location="Greensburg, PA"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="pioga.org"},
    [pscustomobject]@{Month="Apr 2026"; Name="Retail Technology Show 2026"; Dates="Apr 22-23, 2026"; Location="London, UK"; Vertical="Retail"; ExpoCost="TBD"; Attendees=""; Notes="retailtechnologyshow.com"},
    [pscustomobject]@{Month="Apr 2026"; Name="21st Pipeline Technology Conference (ptc)"; Dates="Apr 27-30, 2026"; Location="Berlin, Germany"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="pipelineconf.com — global pipeline industry"},
    [pscustomobject]@{Month="May 2026"; Name="OTC 2026 – Offshore Technology Conference"; Dates="May 4-7, 2026"; Location="Houston, TX (NRG Park)"; Vertical="Midstream / O&G"; ExpoCost="~`$50-`$100 expo"; Attendees="60,000+"; Notes="otcnet.org — top offshore/midstream show"},
    [pscustomobject]@{Month="May 2026"; Name="Seamless Middle East 2026"; Dates="May 12-14, 2026"; Location="Dubai, UAE"; Vertical="Retail"; ExpoCost="Free"; Attendees=""; Notes="Fintech/retail/eCommerce"},
    [pscustomobject]@{Month="May 2026"; Name="TCEQ Environmental Trade Fair & Conference"; Dates="May 19-20, 2026"; Location="San Antonio, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Environmental/pipeline compliance"},
    [pscustomobject]@{Month="May 2026"; Name="Williston Basin Petroleum Conference"; Dates="May 26-30, 2026"; Location="Bismarck, ND"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="wbpc.net"},
    [pscustomobject]@{Month="Jun 2026"; Name="Gas, LNG & The Future of Energy 2026"; Dates="Jun 2-3, 2026"; Location="London, UK"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees="300+"; Notes=""},
    [pscustomobject]@{Month="Jun 2026"; Name="Global Energy Show Canada 2026"; Dates="Jun 9-11, 2026"; Location="Calgary, AB"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="BMO Centre"},
    [pscustomobject]@{Month="Jun 2026"; Name="Midstream Engineering & Construction Expo (EPC Show)"; Dates="Jun 16-17, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees="10,000+ / 400+ exhibitors"; Notes="epcshow.com — pipelines, processing, storage, terminals"},
    [pscustomobject]@{Month="Jun 2026"; Name="CommerceNext Growth Show 2026"; Dates="Jun 24-26, 2026"; Location="New York, NY"; Vertical="Retail"; ExpoCost="TBD"; Attendees=""; Notes="eCommerce/retail digital strategy"},
    [pscustomobject]@{Month="Sep 2026"; Name="Annual Onshore Wellsite Facilities Congress"; Dates="Sep 15-17, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes=""},
    [pscustomobject]@{Month="Sep 2026"; Name="Subsea Pipeline Technology Congress (SPT 2026)"; Dates="Sep 15-16, 2026"; Location="London, UK"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="Offshore pipeline/riser tech"},
    [pscustomobject]@{Month="Sep 2026"; Name="GPA Midstream Convention"; Dates="Sep 20-23, 2026"; Location="San Antonio, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees="1,800+"; Notes="gpamidstream.org; sponsorships open Apr 29"},
    [pscustomobject]@{Month="Sep 2026"; Name="North Dakota Petroleum Council Annual Meeting"; Dates="Sep 20-23, 2026"; Location="Watford City, ND"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="ndpc.org"},
    [pscustomobject]@{Month="Sep 2026"; Name="International Pipeline Conference & Expo"; Dates="Sep 22-24, 2026"; Location="Calgary, AB"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="300+ exhibitors; safety/digitalization"},
    [pscustomobject]@{Month="Sep 2026"; Name="Retail Supply Chain & Logistics Expo 2026"; Dates="Sep 30 – Oct 1, 2026"; Location="New York, NY"; Vertical="Retail"; ExpoCost="TBD"; Attendees=""; Notes="retailscl.com"},
    [pscustomobject]@{Month="Oct 2026"; Name="SPE Permian Basin Energy Conference"; Dates="Oct 7-8, 2026"; Location="Midland, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="spe.org"},
    [pscustomobject]@{Month="Oct 2026"; Name="Carbon Capture, Utilization & Storage Conference"; Dates="Oct 8, 2026"; Location="Houston, TX"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="InterContinental Houston"},
    [pscustomobject]@{Month="Oct 2026"; Name="Indiana Oil & Gas Assoc. Annual Meeting & Trade Show"; Dates="Oct 12-16, 2026"; Location="New Harmony, IN"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees=""; Notes="ioga.org"},
    [pscustomobject]@{Month="Nov 2026"; Name="ADIPEC 2026"; Dates="Nov 2-5, 2026"; Location="Abu Dhabi, UAE"; Vertical="Midstream / O&G"; ExpoCost="TBD"; Attendees="160,000+"; Notes="adipec.com — massive global energy show"},
    [pscustomobject]@{Month="Nov 2026"; Name="Retail Supply Chain & Logistics Expo 2026 (London)"; Dates="Nov 11-12, 2026"; Location="London, UK"; Vertical="Retail"; ExpoCost="TBD"; Attendees=""; Notes="retailscl.com"}
)

# Group by month
$months = $conferences | Select-Object -ExpandProperty Month -Unique

# Header style colors
$headerColor = 0x2F5496  # dark blue
$midstreamColor = 0xD6E4F7
$retailColor = 0xE2F0D9
$generalColor = 0xFFF2CC

# Delete extra sheets — keep only 1 to start
while ($wb.Sheets.Count -gt 1) {
    $wb.Sheets.Item($wb.Sheets.Count).Delete()
}

$firstSheet = $true
foreach ($month in $months) {
    if ($firstSheet) {
        $ws = $wb.Sheets.Item(1)
        $ws.Name = $month
        $firstSheet = $false
    } else {
        $ws = $wb.Sheets.Add([System.Reflection.Missing]::Value, $wb.Sheets.Item($wb.Sheets.Count))
        $ws.Name = $month
    }

    # Headers
    $headers = @("Show Name","Dates","Location","Vertical","Expo Pass Cost","Attendees","Notes / URL")
    for ($i = 0; $i -lt $headers.Count; $i++) {
        $cell = $ws.Cells.Item(1, $i+1)
        $cell.Value2 = $headers[$i]
        $cell.Font.Bold = $true
        $cell.Font.Color = 0xFFFFFF
        $cell.Interior.Color = $headerColor
    }

    $row = 2
    $monthData = $conferences | Where-Object { $_.Month -eq $month }
    foreach ($c in $monthData) {
        $ws.Cells.Item($row, 1).Value2 = $c.Name
        $ws.Cells.Item($row, 2).Value2 = $c.Dates
        $ws.Cells.Item($row, 3).Value2 = $c.Location
        $ws.Cells.Item($row, 4).Value2 = $c.Vertical
        $ws.Cells.Item($row, 5).Value2 = $c.ExpoCost
        $ws.Cells.Item($row, 6).Value2 = $c.Attendees
        $ws.Cells.Item($row, 7).Value2 = $c.Notes

        # Row color by vertical
        $color = switch ($c.Vertical) {
            "Midstream / O&G" { $midstreamColor }
            "Retail"          { $retailColor }
            default           { $generalColor }
        }
        $ws.Range($ws.Cells.Item($row,1), $ws.Cells.Item($row,7)).Interior.Color = $color
        $row++
    }

    # Auto-fit columns
    $ws.Columns.AutoFit() | Out-Null

    # Freeze top row
    $ws.Activate()
    $excel.ActiveWindow.SplitRow = 1
    $excel.ActiveWindow.FreezePanes = $true
}

# Also add an "All Shows" master tab at the front
$allWs = $wb.Sheets.Add($wb.Sheets.Item(1))
$allWs.Name = "All Shows"
$headers = @("Month","Show Name","Dates","Location","Vertical","Expo Pass Cost","Attendees","Notes / URL")
for ($i = 0; $i -lt $headers.Count; $i++) {
    $cell = $allWs.Cells.Item(1, $i+1)
    $cell.Value2 = $headers[$i]
    $cell.Font.Bold = $true
    $cell.Font.Color = 0xFFFFFF
    $cell.Interior.Color = $headerColor
}
$row = 2
foreach ($c in $conferences) {
    $allWs.Cells.Item($row, 1).Value2 = $c.Month
    $allWs.Cells.Item($row, 2).Value2 = $c.Name
    $allWs.Cells.Item($row, 3).Value2 = $c.Dates
    $allWs.Cells.Item($row, 4).Value2 = $c.Location
    $allWs.Cells.Item($row, 5).Value2 = $c.Vertical
    $allWs.Cells.Item($row, 6).Value2 = $c.ExpoCost
    $allWs.Cells.Item($row, 7).Value2 = $c.Attendees
    $allWs.Cells.Item($row, 8).Value2 = $c.Notes
    $color = switch ($c.Vertical) {
        "Midstream / O&G" { $midstreamColor }
        "Retail"          { $retailColor }
        default           { $generalColor }
    }
    $allWs.Range($allWs.Cells.Item($row,1), $allWs.Cells.Item($row,8)).Interior.Color = $color
    $row++
}
$allWs.Columns.AutoFit() | Out-Null
$allWs.Activate()
$excel.ActiveWindow.SplitRow = 1
$excel.ActiveWindow.FreezePanes = $true

# Save
$outPath = "C:\Users\IkeFl\.openclaw\workspace\data\conferences-2025-2026.xlsx"
$wb.SaveAs($outPath, 51)  # 51 = xlOpenXMLWorkbook
$wb.Close($false)
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output "Saved to: $outPath"
