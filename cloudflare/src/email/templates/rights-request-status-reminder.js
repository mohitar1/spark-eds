/**
 * Email template: rights-request-status-reminder
 * Content aligned with rights-request-status-reminder.html (reviewer reminder after 7+ days in status).
 * Placeholders: {{emailTemplateLogoUrl}}, {{requestId}}, {{rightsRequestStatus}}, {{daysInStatus}}, {{requestDetailsUrl}}, {{submittedBy}}
 */
export default `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Rights Request Status Reminder</title>
    <style type="text/css">
        p { margin: 10px 0; padding: 0; }
        table { border-collapse: collapse; }
        h1, h2, h3, h4, h5, h6 { display: block; margin: 0; padding: 0; }
        img, a img { border: 0; height: auto; outline: none; text-decoration: none; }
        body, #bodyTable, #bodyCell { height: 100%; margin: 0; padding: 0; width: 100%; }
        #outlook a { padding: 0; }
        img { -ms-interpolation-mode: bicubic; }
        table { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        .ReadMsgBody { width: 100%; }
        .ExternalClass { width: 100%; }
        p, a, li, td, blockquote { mso-line-height-rule: exactly; }
        p, a, li, td, body, table, blockquote { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
        .ExternalClass, .ExternalClass p, .ExternalClass td, .ExternalClass div, .ExternalClass span, .ExternalClass font { line-height: 100%; }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
        #bodyCell { padding: 10px; }
        .templateContainer { max-width: 600px !important; }
        .mcnTextContent { word-break: break-word; }
        body, #bodyTable { background-color: #f5f5f5; }
        #templatePreheader { background-color: #f5f5f5; border-top: 0; border-bottom: 0; padding-top: 0; padding-bottom: 24px; }
        #templateHeader { background-color: #ffffff; border-top: 0; border-bottom: 0; padding-top: 40px; padding-bottom: 0; }
        #templateBody .mcnTextContent, #templateBody .mcnTextContent p { color: #212121; font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 200%; text-align: left; }
        #templateBody .mcnTextContent a { color: #f4511e; font-weight: normal; text-decoration: none; }
        #templateFooter { background-color: #f5f5f5; border-top: 0; border-bottom: 0; padding-top: 9px; padding-bottom: 9px; }
        @media only screen and (min-width:768px) { .templateContainer { width: 600px !important; } }
    </style>
    <link href="https://fonts.googleapis.com/css?family=Raleway:400,700" rel="stylesheet">
</head>
<body style="height: 100%;margin: 0;padding: 0;width: 100%;-ms-text-size-adjust: 100%;-webkit-text-size-adjust: 100%;background-color: #f5f5f5;">
    <center>
        <table align="center" border="0" cellpadding="0" cellspacing="0" height="100%" width="100%" id="bodyTable" style="border-collapse: collapse;height: 100%;margin: 0;padding: 0;width: 100%;background-color: #f5f5f5;">
            <tr>
                <td align="center" valign="top" id="bodyCell" style="height: 100%;margin: 0;padding: 10px;width: 100%;border-top: 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer" style="border-collapse: collapse;border: 0;max-width: 600px !important;">
                        <tr>
                            <td valign="top" id="templatePreheader" style="background-color: #f5f5f5;border-top: 0;border-bottom: 0;padding-top: 0;padding-bottom: 24px;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnImageBlock" style="min-width: 100%;border-collapse: collapse;">
                                    <tbody class="mcnImageBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnImageBlockInner" style="padding: 0;">
                                                <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" class="mcnImageContentContainer" style="min-width: 100%;border-collapse: collapse;">
                                                    <tbody>
                                                        <tr>
                                                            <td class="mcnImageContent" valign="top" style="padding: 0;text-align: center;">
                                                                <img align="center" alt="Logo" src="{{emailTemplateLogoUrl}}" width="48" style="max-width: 48px;padding-bottom: 0;display: inline !important;vertical-align: bottom;border: 0;height: auto;outline: none;text-decoration: none;" class="mcnImage">
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td valign="top" id="templateHeader" style="background-color: #ffffff;border-top: 0;border-bottom: 0;padding-top: 40px;padding-bottom: 0;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnBoxedTextBlock" style="min-width: 100%;border-collapse: collapse;">
                                    <tbody class="mcnBoxedTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnBoxedTextBlockInner">
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%;border-collapse: collapse;" class="mcnBoxedTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td style="padding: 9px 18px;">
                                                                <table border="0" cellpadding="18" cellspacing="0" class="mcnTextContentContainer" width="100%" style="min-width: 100% !important;border-collapse: collapse;">
                                                                    <tbody>
                                                                        <tr>
                                                                            <td valign="top" class="mcnTextContent" style="font-weight: normal;word-break: break-word;color: #212121;font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;font-size: 26px;line-height: 125%;letter-spacing: normal;text-align: center;">
                                                                                <h1 style="display: block;margin: 0;padding: 0;color: #212121;font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;font-size: 26px;font-style: normal;font-weight: normal;line-height: 125%;letter-spacing: normal;text-align: center;">Rights Request Status Reminder</h1>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td valign="top" id="templateBody" style="background-color: #ffffff;border-top: 0;border-bottom: 0;padding-top: 0;padding-bottom: 48px;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnBoxedTextBlock" style="min-width: 100%;border-collapse: collapse;">
                                    <tbody class="mcnBoxedTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnBoxedTextBlockInner">
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%;border-collapse: collapse;" class="mcnBoxedTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td style="padding: 0 18px;">
                                                                <table border="0" cellpadding="18" cellspacing="0" class="mcnTextContentContainer" width="100%" style="min-width: 100% !important;border-collapse: collapse;">
                                                                    <tbody>
                                                                        <tr>
                                                                            <td valign="top" class="mcnTextContent" style="font-weight: normal;word-break: break-word;color: #212121;font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;font-size: 14px;line-height: 200%;text-align: center;">
                                                                                <p style="font-weight: normal;margin: 5px 0;padding: 0;color: #212121;font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;font-size: 14px;line-height: 200%;text-align: left;">
                                                                                    The Rights Request created under the path <b>{{requestId}}</b> remains in <b>{{rightsRequestStatus}}</b> status for more than a week ({{daysInStatus}} days).
                                                                                </p>
                                                                                <p style="font-weight: normal;margin: 10px 0;padding: 0;color: #212121;font-family: 'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif;font-size: 14px;line-height: 200%;text-align: left;">
                                                                                    <strong>Submitted by:</strong> {{submittedBy}}
                                                                                </p>
                                                                                <p style="margin: 16px 0 0 0; padding: 0;">
                                                                                    <a href="{{requestDetailsUrl}}" style="color: #f4511e; font-weight: normal; text-decoration: none;">View request details</a>
                                                                                </p>
                                                                                <br /> Thank you, <br /> KO Assets Team
                                                                            </td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td valign="top" id="templateFooter" style="background-color: #f5f5f5;border-top: 0;border-bottom: 0;padding-top: 9px;padding-bottom: 9px;"></td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>`;
