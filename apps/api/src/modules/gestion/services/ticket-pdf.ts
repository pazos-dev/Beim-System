/**
 * Internal ticket PDF renderer (issue #167).
 *
 * Renders a TicketDocument to PDF bytes in memory with pdfkit (no browser,
 * no files on disk). Layout is a plain single-column workshop ticket:
 * business header, non-fiscal notice, ticket meta, client/device, lines,
 * total and the template sections in document order.
 */
import PDFDocument from "pdfkit";
import type { TicketDocument } from "./ticket-document.js";

function formatMoney(value: number): string {
  return `$U ${value.toFixed(2)}`;
}

function formatDate(value: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Renders the ticket document to PDF bytes (in memory, nothing on disk). */
export function renderTicketPdf(doc: TicketDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A5", margin: 40, info: { Title: `Ticket interno ${doc.ticket.number}` } });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", (error: Error) => reject(error));

    if (doc.header.name !== undefined) {
      pdf.fontSize(16).text(doc.header.name, { align: "center" });
    }
    for (const line of [doc.header.address, doc.header.phone, doc.header.rut]) {
      if (line !== undefined) pdf.fontSize(9).text(line, { align: "center" });
    }
    pdf.moveDown(0.5);

    pdf.fontSize(11).text(doc.nonFiscalText, { align: "center" });
    pdf.moveDown(0.5);

    pdf.fontSize(14).text(`Ticket interno N.º ${doc.ticket.number}`, { align: "left" });
    pdf.fontSize(9).text(`Emitido: ${formatDate(doc.ticket.createdAt)}   Estado: ${doc.ticket.status}`);
    pdf.fontSize(9).text(`Pago: ${doc.ticket.paymentStatus}`);
    pdf.moveDown(0.5);

    pdf.fontSize(11).text("Cliente");
    pdf.fontSize(9).text(doc.ticket.client.name);
    if (doc.ticket.client.phone != null && doc.ticket.client.phone !== "") {
      pdf.fontSize(9).text(`Tel: ${doc.ticket.client.phone}`);
    }
    if (doc.ticket.client.id != null && doc.ticket.client.id !== "") {
      pdf.fontSize(9).text(`Doc: ${doc.ticket.client.id}`);
    }
    pdf.moveDown(0.5);

    const deviceBits = [doc.ticket.device.brand, doc.ticket.device.model, doc.ticket.device.color].filter(
      (bit): bit is string => bit != null && bit !== ""
    );
    if (deviceBits.length > 0 || doc.ticket.issue != null || doc.ticket.device.services.length > 0) {
      pdf.fontSize(11).text("Equipo");
      if (deviceBits.length > 0) pdf.fontSize(9).text(deviceBits.join(" · "));
      if (doc.ticket.imei != null && doc.ticket.imei !== "") pdf.fontSize(9).text(`IMEI/serie: ${doc.ticket.imei}`);
      if (doc.ticket.issue != null && doc.ticket.issue !== "") pdf.fontSize(9).text(`Falla: ${doc.ticket.issue}`);
      if (doc.ticket.device.services.length > 0) {
        pdf.fontSize(9).text(`Servicios: ${doc.ticket.device.services.join(", ")}`);
      }
      pdf.moveDown(0.5);
    }

    pdf.fontSize(11).text("Detalle");
    for (const line of doc.lines) {
      pdf.fontSize(9).text(`${line.description}  x${line.quantity}  —  ${formatMoney(line.amount)}`);
    }
    pdf.moveDown(0.5);
    pdf.fontSize(12).text(`Total: ${formatMoney(doc.total)}`);
    pdf.moveDown(0.5);

    for (const section of doc.sections) {
      if (section.title !== "") pdf.fontSize(11).text(section.title);
      pdf.fontSize(9).text(section.body);
      pdf.moveDown(0.5);
    }

    pdf.end();
  });
}
