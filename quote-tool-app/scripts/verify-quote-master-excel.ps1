param(
    [Parameter(Mandatory = $true)][string[]]$Paths
)

$ErrorActionPreference = 'Stop'
$excel = $null
$books = $null
try {
    # Use a separate, hidden Excel instance. Never save or repair the input workbooks.
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.EnableEvents = $false
    $excel.AskToUpdateLinks = $false
    $excel.AutomationSecurity = 3
    $books = $excel.Workbooks
    foreach ($path in $Paths) {
        $resolved = (Resolve-Path -LiteralPath $path).Path
        $book = $null
        try {
            $book = $books.Open($resolved, 0, $true)
            $sheets = $book.Worksheets
            $pricing = $sheets.Item('Pricing')
            $sale = $pricing.Range('E99')
            $monthly = $pricing.Range('E55')
            [pscustomobject]@{ Path = $resolved; Status = 'Opened normally without repair'; Sheets = $sheets.Count; OneTime = $sale.Value2; Monthly = $monthly.Value2 } | ConvertTo-Json -Compress
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sale)
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($monthly)
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($pricing)
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sheets)
        } catch {
            [pscustomobject]@{ Path = $resolved; Status = 'Normal open failed'; Error = $_.Exception.Message } | ConvertTo-Json -Compress
            throw
        } finally {
            if ($null -ne $book) {
                $book.Close($false)
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book)
            }
        }
    }
} finally {
    if ($null -ne $books) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($books) }
    if ($null -ne $excel) {
        $excel.Quit()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
