permite efetuar o CI/CD do container da aplicação, tendo que ativar ele no google cloud. Info:

> Cloud Build, Google Cloud’s continuous integration (CI) and continuous delivery (CD) platform, lets you build software quickly across all languages. Get complete control over defining custom workflows for building, testing, and deploying across multiple environments such as VMs, serverless, Kubernetes, or Firebase

Basta criar um trigger para que alterações no github acionem ele a subir e alterar as imagens salvas de dockerfile no google.