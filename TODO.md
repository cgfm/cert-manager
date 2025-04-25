# TODO
## Passphrases
- Die passphrases mussen von der gui gesetzt aber nicht gelesen werden können. Das heisst, dass die passphrases nicht im gui angezeigt werden dürfen.
- Es muss eine Funktion hasPassphrase geben die zu einem Zertifikat zurück gibt ob eine Passphrase gespeichert wurde.

## deploy

Here are some additional deployment options you might consider implementing:

1. **API Calls**: Make HTTP requests to APIs to update certificates
2. **Kubernetes Secret Updates**: Update Kubernetes secret objects
3. **Webhook Notifications**: Send webhooks to trigger external systems
4. **Email Notifications**: Send email notifications when certs are deployed
5. **Cloud Storage**: Upload certificates to S3, Google Cloud Storage, etc.
6. **Load Balancer Updates**: Update certs in cloud load balancers (AWS, GCP, Azure)
7. **Database Storage**: Store certs in database systems for applications to retrieve
