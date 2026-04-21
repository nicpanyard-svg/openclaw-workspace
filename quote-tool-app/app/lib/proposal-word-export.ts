import {
  buildProposalPdfViewModel,
  formatCurrency,
} from "@/app/lib/proposal-pdf";
import type { QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";

type ImageAsset = {
  bytes: Uint8Array;
  extension: "png" | "jpg" | "jpeg";
  mimeType: "image/png" | "image/jpeg";
  widthPx: number;
  heightPx: number;
};

type DocxImage = ImageAsset & {
  fileName: string;
  relId: string;
  docPrId: number;
  altText: string;
  widthEmu: number;
  heightEmu: number;
};

type ParagraphOptions = {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  sizeHalfPoints?: number;
  align?: "left" | "center" | "right";
  spacingAfter?: number;
  spacingBefore?: number;
  pageBreakBefore?: boolean;
  keepNext?: boolean;
  keepLines?: boolean;
};

type TableCell = {
  content: string;
  width?: number;
  shading?: string;
  bold?: boolean;
};

type TableRow = {
  cells: TableCell[];
  header?: boolean;
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getPricingLabel(row: ServicePricingRow) {
  return row.pricingStage === "final" ? "Final" : "Budgetary";
}

function pxToEmu(value: number) {
  return Math.round(value * 9525);
}

function fitImage(widthPx: number, heightPx: number, maxWidthPx: number, maxHeightPx: number) {
  if (!widthPx || !heightPx) {
    return { widthEmu: pxToEmu(maxWidthPx), heightEmu: pxToEmu(maxHeightPx) };
  }

  const scale = Math.min(maxWidthPx / widthPx, maxHeightPx / heightPx, 1);

  return {
    widthEmu: pxToEmu(widthPx * scale),
    heightEmu: pxToEmu(heightPx * scale),
  };
}

function textRun(text: string, options: Omit<ParagraphOptions, "align" | "spacingAfter" | "spacingBefore" | "pageBreakBefore" | "keepNext" | "keepLines"> = {}) {
  const properties: string[] = [];

  if (options.bold) properties.push("<w:b/>");
  if (options.italic) properties.push("<w:i/>");
  if (options.color) properties.push(`<w:color w:val="${options.color}"/>`);
  if (options.sizeHalfPoints) properties.push(`<w:sz w:val="${options.sizeHalfPoints}"/>`, `<w:szCs w:val="${options.sizeHalfPoints}"/>`);

  return `<w:r>${properties.length ? `<w:rPr>${properties.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(text: string, options: ParagraphOptions = {}) {
  const paragraphProperties: string[] = [];

  if (options.align) paragraphProperties.push(`<w:jc w:val="${options.align}"/>`);
  if (options.spacingAfter !== undefined || options.spacingBefore !== undefined) {
    paragraphProperties.push(
      `<w:spacing${options.spacingBefore !== undefined ? ` w:before="${options.spacingBefore}"` : ""}${options.spacingAfter !== undefined ? ` w:after="${options.spacingAfter}"` : ""}/>`,
    );
  }
  if (options.pageBreakBefore) paragraphProperties.push("<w:pageBreakBefore/>");
  if (options.keepNext) paragraphProperties.push("<w:keepNext/>");
  if (options.keepLines) paragraphProperties.push("<w:keepLines/>");

  return `<w:p>${paragraphProperties.length ? `<w:pPr>${paragraphProperties.join("")}</w:pPr>` : ""}${textRun(text, options)}</w:p>`;
}

function emptyParagraph() {
  return `<w:p><w:r><w:t></w:t></w:r></w:p>`;
}

function imageParagraph(image: DocxImage, align: "left" | "center" | "right" = "left") {
  return `<w:p>
    <w:pPr><w:jc w:val="${align}"/></w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0"
          xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${image.widthEmu}" cy="${image.heightEmu}"/>
          <wp:docPr id="${image.docPrId}" name="${xmlEscape(image.fileName)}" descr="${xmlEscape(image.altText)}"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${image.docPrId}" name="${xmlEscape(image.fileName)}" descr="${xmlEscape(image.altText)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${image.relId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${image.widthEmu}" cy="${image.heightEmu}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function imageSection(image: DocxImage, align: "left" | "center" | "right" = "center", spacingBefore = 120, spacingAfter = 0) {
  return `<w:p>
    <w:pPr>
      <w:jc w:val="${align}"/>
      <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}"/>
    </w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0"
          xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${image.widthEmu}" cy="${image.heightEmu}"/>
          <wp:docPr id="${image.docPrId}" name="${xmlEscape(image.fileName)}" descr="${xmlEscape(image.altText)}"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${image.docPrId}" name="${xmlEscape(image.fileName)}" descr="${xmlEscape(image.altText)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${image.relId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${image.widthEmu}" cy="${image.heightEmu}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function table(rows: TableRow[], totalWidth = 9000) {
  if (!rows.length) return "";

  const cellCount = Math.max(...rows.map((row) => row.cells.length));
  const defaultWidth = Math.floor(totalWidth / Math.max(cellCount, 1));

  const grid = Array.from({ length: cellCount }, (_, index) => {
    const width = rows[0]?.cells[index]?.width ?? defaultWidth;
    return `<w:gridCol w:w="${width}"/>`;
  }).join("");

  const body = rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const cellParagraph = cell.content || emptyParagraph();
          const cellProps: string[] = [`<w:tcW w:w="${cell.width ?? defaultWidth}" w:type="dxa"/>`];

          if (cell.shading) cellProps.push(`<w:shd w:val="clear" w:color="auto" w:fill="${cell.shading}"/>`);

          const wrappedContent = cell.bold
            ? cellParagraph.replace("<w:p>", '<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr>')
            : cellParagraph;

          return `<w:tc><w:tcPr>${cellProps.join("")}</w:tcPr>${wrappedContent}</w:tc>`;
        })
        .join("");

      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalWidth}" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
        <w:insideH w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
        <w:insideV w:val="single" w:sz="8" w:space="0" w:color="D9E2EC"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="96" w:type="dxa"/>
        <w:left w:w="96" w:type="dxa"/>
        <w:bottom w:w="96" w:type="dxa"/>
        <w:right w:w="96" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${body}
  </w:tbl>`;
}

function xmlDocument(content: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`;
}

async function loadImageAsset(source: string): Promise<ImageAsset> {
  const response = await fetch(source);
  const blob = await response.blob();
  const mimeType = blob.type === "image/png" ? "image/png" : "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : source.toLowerCase().includes(".jpg") ? "jpg" : "jpeg";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error(`Unable to load image dimensions for ${source}`));
    image.src = source;
  });

  return {
    bytes,
    extension,
    mimeType,
    widthPx: dimensions.width,
    heightPx: dimensions.height,
  };
}

function makeDocxImage(asset: ImageAsset, fileName: string, relId: string, docPrId: number, altText: string, maxWidthPx: number, maxHeightPx: number): DocxImage {
  const fitted = fitImage(asset.widthPx, asset.heightPx, maxWidthPx, maxHeightPx);

  return {
    ...asset,
    fileName,
    relId,
    docPrId,
    altText,
    widthEmu: fitted.widthEmu,
    heightEmu: fitted.heightEmu,
  };
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

const crc32Table = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let shift = 0; shift < 8; shift += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }

  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11);
  const dosDate = date.getDate() | ((date.getMonth() + 1) << 5) | ((year - 1980) << 9);

  return { dosDate, dosTime };
}

function writeUint16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function createStoredZip(entries: ZipEntry[]) {
  const now = dosDateTime(new Date());
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileNameBytes = encodeUtf8(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + fileNameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, now.dosTime);
    writeUint16(localHeader, 12, now.dosDate);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, entry.data.length);
    writeUint32(localHeader, 22, entry.data.length);
    writeUint16(localHeader, 26, fileNameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(fileNameBytes, 30);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, now.dosTime);
    writeUint16(centralHeader, 14, now.dosDate);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, entry.data.length);
    writeUint32(centralHeader, 24, entry.data.length);
    writeUint16(centralHeader, 28, fileNameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, localOffset);
    centralHeader.set(fileNameBytes, 46);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const endRecord = new Uint8Array(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, entries.length);
  writeUint16(endRecord, 10, entries.length);
  writeUint32(endRecord, 12, centralDirectory.length);
  writeUint32(endRecord, 16, localOffset);
  writeUint16(endRecord, 20, 0);

  return concatUint8Arrays([...localParts, centralDirectory, endRecord]);
}

function buildContentTypesXml(images: DocxImage[]) {
  const imageDefaults = Array.from(new Set(images.map((image) => image.extension)))
    .map((extension) => `<Default Extension="${extension}" ContentType="${extension === "png" ? "image/png" : "image/jpeg"}"/>`)
    .join("");

  return xmlDocument(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      ${imageDefaults}
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
      <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
      <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
    </Types>`,
  );
}

function buildPackageRelationshipsXml() {
  return xmlDocument(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
    </Relationships>`,
  );
}

function buildDocumentRelationshipsXml(images: DocxImage[]) {
  const imageRelationships = images
    .map(
      (image) =>
        `<Relationship Id="${image.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`,
    )
    .join("");

  return xmlDocument(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      ${imageRelationships}
    </Relationships>`,
  );
}

function buildStylesXml() {
  return xmlDocument(
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults>
        <w:rPrDefault>
          <w:rPr>
            <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos"/>
            <w:sz w:val="22"/>
            <w:szCs w:val="22"/>
            <w:lang w:val="en-US"/>
          </w:rPr>
        </w:rPrDefault>
      </w:docDefaults>
    </w:styles>`,
  );
}

function buildCoreXml(title: string) {
  const created = new Date().toISOString();

  return xmlDocument(
    `<cp:coreProperties
      xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:dcterms="http://purl.org/dc/terms/"
      xmlns:dcmitype="http://purl.org/dc/dcmitype/"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <dc:title>${xmlEscape(title)}</dc:title>
      <dc:creator>RapidQuote</dc:creator>
      <cp:lastModifiedBy>RapidQuote</cp:lastModifiedBy>
      <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
      <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
    </cp:coreProperties>`,
  );
}

function buildAppXml() {
  return xmlDocument(
    `<Properties
      xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
      xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
      <Application>RapidQuote</Application>
    </Properties>`,
  );
}

function buildProposalDocumentXml(quote: QuoteRecord, images: { inetLogo: DocxImage; customerLogo?: DocxImage; footerHex: DocxImage }) {
  const model = buildProposalPdfViewModel(quote);

  const blocks: string[] = [];

  blocks.push(imageParagraph(images.inetLogo));
  blocks.push(paragraph("iNet Communications Proposal", { bold: true, color: "7A042E", spacingAfter: 120 }));
  blocks.push(paragraph(model.documentTitle, { bold: true, sizeHalfPoints: 34, spacingAfter: 80 }));
  blocks.push(paragraph(model.documentSubtitle, { color: "60707F", spacingAfter: 180 }));

  const preparedForContent = [
    paragraph("Prepared for", { bold: true, color: "7A042E", spacingAfter: 60 }),
    images.customerLogo
      ? imageParagraph(images.customerLogo)
      : paragraph(model.customerLogoText || model.customerName, { bold: true, spacingAfter: 80 }),
    paragraph(model.customerName, { bold: true }),
    paragraph(model.customerContactName),
    paragraph(model.customerContactPhone),
    paragraph(model.customerContactEmail),
    ...model.customerAddressLines.map((line) => paragraph(line)),
  ].join("");

  const preparedByContent = [
    paragraph(model.documentation.preparedByLabel ?? "Prepared by", { bold: true, color: "7A042E", spacingAfter: 60 }),
    imageParagraph(images.inetLogo),
    paragraph(model.inetContactName, { bold: true }),
    paragraph(model.inetName),
    paragraph(model.inetContactPhone),
    paragraph(model.inetContactEmail),
    ...model.inetAddressLines.map((line) => paragraph(line)),
  ].join("");

  blocks.push(
    table(
      [
        {
          cells: [
            { content: preparedForContent, width: 4500 },
            { content: preparedByContent, width: 4500 },
          ],
        },
      ],
      9000,
    ),
  );

  blocks.push(emptyParagraph());
  blocks.push(
    table(
      [
        {
          cells: model.pricingSnapshotItems.map((item) => ({
            width: Math.floor(9000 / model.pricingSnapshotItems.length),
            content: `${paragraph(item.label, { bold: true, color: item.tone === "accent" ? "7A042E" : "60707F", spacingAfter: 40 })}${paragraph(item.formattedValue, { bold: true })}`,
          })),
        },
      ],
      9000,
    ),
  );
  blocks.push(imageSection(images.footerHex, "center", 160, 0));

  blocks.push(paragraph("Proposal Information", { bold: true, sizeHalfPoints: 30, spacingBefore: 240, spacingAfter: 120, pageBreakBefore: true, keepNext: true }));
  blocks.push(paragraph(`Proposal #${model.documentation.proposalNumberLabel}`, { bold: true }));
  blocks.push(paragraph(model.documentation.proposalTitle));
  blocks.push(paragraph(model.documentation.proposalDateLabel));
  blocks.push(paragraph(`Revision ${model.revisionVersion}`, { color: "60707F", spacingAfter: 140 }));

  blocks.push(
    table(
      [
        {
          cells: [
            {
              width: 4500,
              content: [
                paragraph("Customer", { bold: true, color: "7A042E", spacingAfter: 60 }),
                paragraph(`Customer Contact: ${model.customerContactName}`),
                paragraph(`Contact Phone: ${model.customerContactPhone}`),
                paragraph(`Contact Email: ${model.customerContactEmail}`),
                paragraph(model.documentation.customerAddressHeading, { bold: true, spacingBefore: 80 }),
                ...model.customerAddressLines.map((line) => paragraph(line)),
              ].join(""),
            },
            {
              width: 4500,
              content: [
                paragraph(model.documentation.inetSalesHeading ?? "iNet", { bold: true, color: "7A042E", spacingAfter: 60 }),
                paragraph(`${model.documentation.preparedByLabel ?? "Prepared by"}: ${model.inetContactName}`),
                paragraph(`Contact Phone: ${model.inetContactPhone}`),
                paragraph(`Contact Email: ${model.inetContactEmail}`),
                paragraph(model.documentation.inetAddressHeading, { bold: true, spacingBefore: 80 }),
                ...model.inetAddressLines.map((line) => paragraph(line)),
              ].join(""),
            },
          ],
        },
        {
          cells: [
            {
              width: 4500,
              content: [paragraph(model.documentation.billToHeading ?? "Bill To", { bold: true, color: "7A042E", spacingAfter: 60 }), ...model.billToLines.map((line) => paragraph(line))].join(""),
            },
            {
              width: 4500,
              content: [
                paragraph(model.documentation.shipToHeading ?? "Ship To", { bold: true, color: "7A042E", spacingAfter: 60 }),
                ...model.shipToLines.map((line) => paragraph(line)),
                model.shippingSameAsBillTo ? paragraph("Same as Bill To", { color: "60707F", spacingBefore: 60 }) : "",
              ].join(""),
            },
          ],
        },
      ],
      9000,
    ),
  );

  if (model.executiveSummaryEnabled && model.executiveSummaryParagraphs.length) {
    blocks.push(paragraph(model.executiveSummaryHeading, { bold: true, color: "7A042E", spacingBefore: 200, spacingAfter: 80 }));
    model.executiveSummaryParagraphs.forEach((item) => blocks.push(paragraph(item, { spacingAfter: 80 })));
  }

  if ((model.customerVisibleCustomFields ?? []).length) {
    blocks.push(paragraph("Additional Proposal Details", { bold: true, color: "7A042E", spacingBefore: 200, spacingAfter: 80 }));
    (model.customerVisibleCustomFields ?? []).forEach((field) => {
      blocks.push(paragraph(`${field.label || "Detail"}${field.value ? ` ${field.value}` : ""}`, { spacingAfter: 60 }));
    });
  }

  if (model.sectionAEnabled) {
    blocks.push(paragraph(model.sectionATitle, { bold: true, sizeHalfPoints: 28, spacingBefore: 240, spacingAfter: 120, pageBreakBefore: true, keepNext: true }));
    blocks.push(paragraph(model.sectionAIntro, { spacingAfter: 100 }));
    model.sectionAExplanatoryParagraphs.forEach((item) => blocks.push(paragraph(item, { spacingAfter: 80 })));
    blocks.push(paragraph(`Section summary: ${formatCurrency(model.recurringMonthlyTotal, model.currencyCode)}`, { bold: true, color: "7A042E", spacingAfter: 100 }));
    blocks.push(
      table(
        [
          {
            header: true,
            cells: [
              { content: paragraph("Service Description", { bold: true }), width: 4300, shading: "F4F7FA" },
              { content: paragraph("Qty", { bold: true }), width: 1100, shading: "F4F7FA" },
              { content: paragraph("Unit Monthly", { bold: true }), width: 1800, shading: "F4F7FA" },
              { content: paragraph("Total Monthly", { bold: true }), width: 1800, shading: "F4F7FA" },
            ],
          },
          ...model.sectionARows.map((row) => ({
            cells: [
              {
                width: 4300,
                content: [
                  paragraph(row.description, { bold: true }),
                  row.unitLabel && row.rowType !== "support" && row.rowType !== "terminal_fee" ? paragraph(row.unitLabel, { color: "60707F" }) : "",
                  row.rowType === "support" && row.includedText?.length
                    ? row.includedText.map((item) => paragraph(`* ${item}`, { color: "60707F" })).join("")
                    : "",
                ].join(""),
              },
              { width: 1100, content: paragraph(String(row.quantity ?? "-")) },
              {
                width: 1800,
                content: paragraph(
                  row.rowType === "support" ? "Included with service" : formatCurrency(row.monthlyRate ?? row.unitPrice ?? 0, model.currencyCode),
                ),
              },
              {
                width: 1800,
                content: paragraph(row.rowType === "support" ? "Included" : formatCurrency(row.totalMonthlyRate ?? 0, model.currencyCode)),
              },
            ],
          })),
          {
            cells: [
              { width: 4300, content: paragraph("Total monthly recurring", { bold: true }) },
              { width: 1100, content: emptyParagraph() },
              { width: 1800, content: emptyParagraph() },
              { width: 1800, content: paragraph(formatCurrency(model.recurringMonthlyTotal, model.currencyCode), { bold: true }) },
            ],
          },
        ],
        9000,
      ),
    );
  }

  if (model.sectionBEnabled) {
    blocks.push(paragraph(model.sectionBTitle, { bold: true, sizeHalfPoints: 28, spacingBefore: 240, spacingAfter: 120, pageBreakBefore: true, keepNext: true }));
    blocks.push(paragraph(model.sectionBIntro, { spacingAfter: 100 }));
    blocks.push(paragraph(`Section summary: ${formatCurrency(model.equipmentTotal, model.currencyCode)}`, { bold: true, color: "7A042E", spacingAfter: 100 }));
    blocks.push(
      table(
        [
          {
            cells: [
              { content: paragraph("Equipment Description", { bold: true }), width: 4300, shading: "F4F7FA" },
              { content: paragraph("Qty", { bold: true }), width: 1100, shading: "F4F7FA" },
              { content: paragraph("Unit Price", { bold: true }), width: 1800, shading: "F4F7FA" },
              { content: paragraph("Total Price", { bold: true }), width: 1800, shading: "F4F7FA" },
            ],
          },
          ...model.equipmentRows.map((row) => ({
            cells: [
              {
                width: 4300,
                content: [
                  paragraph(row.itemName, { bold: true }),
                  paragraph([row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).join(" • ") || "Hardware line item", { color: "60707F" }),
                  row.description ? paragraph(row.description, { color: "60707F" }) : "",
                ].join(""),
              },
              { width: 1100, content: paragraph(String(row.quantity)) },
              { width: 1800, content: paragraph(formatCurrency(row.unitPrice, model.currencyCode)) },
              { width: 1800, content: paragraph(formatCurrency(row.totalPrice, model.currencyCode)) },
            ],
          })),
          {
            cells: [
              { width: 4300, content: paragraph("One-time equipment total", { bold: true }) },
              { width: 1100, content: emptyParagraph() },
              { width: 1800, content: emptyParagraph() },
              { width: 1800, content: paragraph(formatCurrency(model.equipmentTotal, model.currencyCode), { bold: true }) },
            ],
          },
        ],
        9000,
      ),
    );
  }

  if (model.sectionCEnabled) {
    blocks.push(paragraph(model.sectionCTitle, { bold: true, sizeHalfPoints: 28, spacingBefore: 240, spacingAfter: 120, pageBreakBefore: true, keepNext: true }));
    blocks.push(paragraph(model.sectionCIntro, { spacingAfter: 100 }));
    blocks.push(paragraph(`Section summary: ${formatCurrency(model.serviceTotal, model.currencyCode)}`, { bold: true, color: "7A042E", spacingAfter: 100 }));
    blocks.push(
      table(
        [
          {
            cells: [
              { content: paragraph("Service Description", { bold: true }), width: 4300, shading: "F4F7FA" },
              { content: paragraph("Qty", { bold: true }), width: 1100, shading: "F4F7FA" },
              { content: paragraph("Unit Price", { bold: true }), width: 1800, shading: "F4F7FA" },
              { content: paragraph("Total Price", { bold: true }), width: 1800, shading: "F4F7FA" },
            ],
          },
          ...model.serviceRows.map((row) => ({
            cells: [
              {
                width: 4300,
                content: [paragraph(row.description, { bold: true }), paragraph(getPricingLabel(row), { color: "60707F" }), row.notes ? paragraph(row.notes, { color: "60707F" }) : ""].join(""),
              },
              { width: 1100, content: paragraph(String(row.quantity)) },
              { width: 1800, content: paragraph(formatCurrency(row.unitPrice, model.currencyCode)) },
              { width: 1800, content: paragraph(formatCurrency(row.totalPrice, model.currencyCode)) },
            ],
          })),
          {
            cells: [
              { width: 4300, content: paragraph("Field services total", { bold: true }) },
              { width: 1100, content: emptyParagraph() },
              { width: 1800, content: emptyParagraph() },
              { width: 1800, content: paragraph(formatCurrency(model.serviceTotal, model.currencyCode), { bold: true }) },
            ],
          },
        ],
        9000,
      ),
    );
  }

  blocks.push(paragraph("Terms that support this commercial proposal", { bold: true, sizeHalfPoints: 30, spacingBefore: 240, spacingAfter: 90, pageBreakBefore: true, keepNext: true }));
  blocks.push(paragraph("The items below stay with the printed proposal so the commercial pages and approval page are backed by the same terms package.", { color: "60707F", spacingAfter: 120 }));
  blocks.push(paragraph(model.terms.generalStarlinkServiceTermsTitle, { bold: true, sizeHalfPoints: 28, spacingAfter: 120, keepNext: true }));
  model.terms.generalStarlinkServiceTerms.forEach((term, index) => blocks.push(paragraph(`${index + 1}. ${term}`, { spacingAfter: 60 })));
  blocks.push(paragraph(model.terms.pricingTermsTitle, { bold: true, sizeHalfPoints: 28, spacingBefore: 200, spacingAfter: 120, keepNext: true }));
  model.terms.pricingTerms.forEach((term) => blocks.push(paragraph(`* ${term}`, { spacingAfter: 60 })));

  blocks.push(paragraph("Summary of proposed pricing", { bold: true, sizeHalfPoints: 30, spacingBefore: 240, spacingAfter: 120, pageBreakBefore: true, keepNext: true }));
  blocks.push(paragraph("Ready for commercial approval", { bold: true, color: "7A042E", spacingAfter: 100 }));
  blocks.push(
    table(
      [
        {
          cells: [
            { width: 3000, content: `${paragraph("Recurring monthly", { bold: true, color: "7A042E" })}${paragraph(formatCurrency(model.recurringMonthlyTotal, model.currencyCode), { bold: true })}` },
            { width: 3000, content: `${paragraph("One-time equipment", { bold: true, color: "7A042E" })}${paragraph(formatCurrency(model.equipmentTotal, model.currencyCode), { bold: true })}` },
            {
              width: 3000,
              content: `${paragraph(model.sectionCEnabled ? "One-time total" : "Proposal status", { bold: true, color: "7A042E" })}${paragraph(
                model.sectionCEnabled ? formatCurrency(model.oneTimeTotal, model.currencyCode) : quote.metadata.status,
                { bold: true },
              )}`,
            },
          ],
        },
      ],
      9000,
    ),
  );

  if (model.sectionCEnabled) {
    blocks.push(paragraph(`Field services: ${formatCurrency(model.serviceTotal, model.currencyCode)}`, { bold: true, spacingBefore: 120 }));
  }

  if (model.quoteType === "lease") {
    blocks.push(paragraph(`Estimated lease monthly: ${formatCurrency(model.leaseMonthly, model.currencyCode)}`, { bold: true, spacingBefore: 120 }));
  }

  blocks.push(paragraph("This proposal outlines the current commercial structure for review. Final scope, taxes, freight, installation assumptions, and delivery details may be refined in the next revision.", { spacingBefore: 160, spacingAfter: 80 }));
  blocks.push(paragraph("Please sign below to indicate acceptance of this proposal and authorization for iNet to proceed with order processing based on the approved scope.", { spacingAfter: 80 }));
  if (model.approval.approvalNote) {
    blocks.push(paragraph(model.approval.approvalNote, { spacingAfter: 100 }));
  }

  blocks.push(paragraph(model.approval.heading, { bold: true, color: "7A042E", spacingBefore: 180, spacingAfter: 60 }));
  blocks.push(paragraph("Authorization to proceed", { bold: true, sizeHalfPoints: 28, spacingAfter: 80 }));
  blocks.push(paragraph("By signing below, the customer confirms review and acceptance of the pricing and scope described in this proposal, subject to any mutually agreed revisions or final contract documents.", { spacingAfter: 100 }));
  blocks.push(
    table(
      [
        {
          cells: [
            { width: 3000, content: `${paragraph("Scope", { color: "60707F" })}${paragraph("Reviewed and accepted", { bold: true })}` },
            { width: 3000, content: `${paragraph("Commercials", { color: "60707F" })}${paragraph("Approved to proceed", { bold: true })}` },
            { width: 3000, content: `${paragraph("Next step", { color: "60707F" })}${paragraph("Release for order processing", { bold: true })}` },
          ],
        },
        {
          cells: [
            { width: 3000, content: `${paragraph("______________________________", { spacingAfter: 50 })}${paragraph(model.approval.signatureLabel)}` },
            { width: 3000, content: `${paragraph("______________________________", { spacingAfter: 50 })}${paragraph(model.approval.customerNameLabel)}` },
            { width: 3000, content: `${paragraph("______________________________", { spacingAfter: 50 })}${paragraph(model.approval.dateLabel)}` },
          ],
        },
      ],
      9000,
    ),
  );
  blocks.push(imageSection(images.footerHex, "center", 160, 0));

  return xmlDocument(
    `<w:document
      xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
      xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:w10="urn:schemas-microsoft-com:office:word"
      xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
      xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
      xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
      xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
      xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
      mc:Ignorable="w14 w15 wp14">
      <w:body>
        ${blocks.join("")}
        <w:sectPr>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="864" w:right="864" w:bottom="864" w:left="864" w:header="720" w:footer="720" w:gutter="0"/>
        </w:sectPr>
      </w:body>
    </w:document>`,
  );
}

export async function buildProposalWordDocument(quote: QuoteRecord) {
  const inetAsset = await loadImageAsset("/inet-logo.png");
  const footerAsset = await loadImageAsset("/proposal-footer-hex.jpg");
  const inetLogo = makeDocxImage(inetAsset, `inet-logo.${inetAsset.extension}`, "rIdImage1", 1, "iNet logo", 180, 64);
  const footerHex = makeDocxImage(footerAsset, `proposal-footer-hex.${footerAsset.extension}`, "rIdImage2", 2, "Hex footer artwork", 624, 118);

  let customerLogo: DocxImage | undefined;
  if (quote.customer.logoDataUrl) {
    const asset = await loadImageAsset(quote.customer.logoDataUrl);
    customerLogo = makeDocxImage(asset, `customer-logo.${asset.extension}`, "rIdImage3", 3, `${quote.customer.name} logo`, 180, 72);
  }

  const allImages = [inetLogo, footerHex, ...(customerLogo ? [customerLogo] : [])];
  const documentXml = buildProposalDocumentXml(quote, { inetLogo, customerLogo, footerHex });

  const zipEntries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encodeUtf8(buildContentTypesXml(allImages)) },
    { name: "_rels/.rels", data: encodeUtf8(buildPackageRelationshipsXml()) },
    { name: "docProps/core.xml", data: encodeUtf8(buildCoreXml(`${quote.metadata.documentTitle} - ${quote.metadata.proposalNumber}`)) },
    { name: "docProps/app.xml", data: encodeUtf8(buildAppXml()) },
    { name: "word/document.xml", data: encodeUtf8(documentXml) },
    { name: "word/_rels/document.xml.rels", data: encodeUtf8(buildDocumentRelationshipsXml(allImages)) },
    { name: "word/styles.xml", data: encodeUtf8(buildStylesXml()) },
    ...allImages.map((image) => ({ name: `word/media/${image.fileName}`, data: image.bytes })),
  ];

  const zipBytes = createStoredZip(zipEntries);

  return new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
